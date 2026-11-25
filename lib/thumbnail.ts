import { getCloudflareContext } from '@opennextjs/cloudflare'
import type { ThumbnailVariant } from '@/lib/format'

export interface CloudflareImagesTransformOptions {
  width?: number
  height?: number
  fit?: 'scale-down' | 'contain' | 'cover' | 'crop' | 'pad' | 'squeeze'
}

export interface CloudflareImagesOutputOptions {
  format: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' | 'image/avif'
  quality?: number
}

export interface CloudflareImagesBinding {
  input(stream: ReadableStream<Uint8Array>): {
    transform(options: CloudflareImagesTransformOptions): {
      output(options: CloudflareImagesOutputOptions): Promise<{
        response(): Response
        contentType(): string
        image(): ReadableStream<Uint8Array>
      }>
    }
  }
}

export const THUMBNAIL_PRESETS: Record<
  ThumbnailVariant,
  { width: number; height: number; fit: 'scale-down' | 'cover'; quality: number }
> = {
  grid: { width: 640, height: 640, fit: 'scale-down', quality: 80 },
  list: { width: 96, height: 96, fit: 'cover', quality: 75 },
}

export const THUMBNAIL_CACHE_CONTROL_CLIENT = 'private, max-age=604800, immutable'
export const THUMBNAIL_CACHE_CONTROL_EDGE = 'public, max-age=604800, immutable'
export const THUMBNAIL_FALLBACK_CACHE_CONTROL = 'private, no-store'
export const UPSTREAM_FETCH_TIMEOUT_MS = 10_000

const DEV_CACHE_SYMBOL = Symbol.for('cranemail.devThumbnailCache')
const DEV_CACHE_MAX_ENTRIES = 64

interface DevCacheEntry {
  bytes: ArrayBuffer
  contentType: string
  cacheControl: string
}

function getDevFallbackCache(): Cache {
  const globalStore = globalThis as Record<symbol, Map<string, DevCacheEntry> | undefined>
  let store = globalStore[DEV_CACHE_SYMBOL]
  if (!store) {
    store = new Map<string, DevCacheEntry>()
    globalStore[DEV_CACHE_SYMBOL] = store
  }

  const toKey = (request: RequestInfo | URL) =>
    request instanceof Request ? request.url : String(request)

  return {
    async match(request: RequestInfo | URL) {
      const key = toKey(request)
      const entry = store.get(key)
      if (!entry) return undefined
      return new Response(entry.bytes.slice(0), {
        status: 200,
        headers: {
          'Content-Type': entry.contentType,
          'Cache-Control': entry.cacheControl,
        },
      })
    },
    async put(request: RequestInfo | URL, response: Response) {
      const key = toKey(request)
      const bytes = await response.arrayBuffer()
      if (!store.has(key) && store.size >= DEV_CACHE_MAX_ENTRIES) {
        const oldestKey = store.keys().next().value
        if (oldestKey !== undefined) store.delete(oldestKey)
      }
      store.set(key, {
        bytes,
        contentType: response.headers.get('Content-Type') || 'image/webp',
        cacheControl: response.headers.get('Cache-Control') || THUMBNAIL_CACHE_CONTROL_EDGE,
      })
    },
    async delete(request: RequestInfo | URL) {
      return store.delete(toKey(request))
    },
    async add() {},
    async addAll() {},
    async keys() {
      return []
    },
    async matchAll() {
      return []
    },
  }
}

const TRANSFORMABLE_CONTENT_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
])

export function parseThumbnailVariant(raw: string | undefined): ThumbnailVariant | null {
  if (raw === undefined || raw === '') {
    return 'grid'
  }
  if (raw === 'grid' || raw === 'list') {
    return raw
  }
  return null
}

export function selectThumbnailOutputFormat(
  acceptHeader: string | null,
): { format: 'image/webp' | 'image/jpeg'; ext: 'webp' | 'jpeg' } {
  if (!acceptHeader || acceptHeader.includes('image/webp') || acceptHeader.includes('*/*')) {
    return { format: 'image/webp', ext: 'webp' }
  }
  return { format: 'image/jpeg', ext: 'jpeg' }
}

export function buildThumbnailCacheKey(
  fileId: string,
  variant: ThumbnailVariant,
  ext: 'webp' | 'jpeg',
): Request {
  return new Request(`https://thumbnail-cache.internal/v1/${encodeURIComponent(fileId)}/${variant}/${ext}`)
}

export function getDefaultEdgeCache(): Cache | null {
  if (typeof caches !== 'undefined' && 'default' in caches) {
    return (caches as unknown as { default?: Cache }).default ?? null
  }
  if (process.env.NODE_ENV === 'development') {
    return getDevFallbackCache()
  }
  return null
}

export function getImagesRuntime(): {
  images?: CloudflareImagesBinding
  waitUntil?: (promise: Promise<unknown>) => void
} {
  try {
    const { env, ctx } = getCloudflareContext()
    const images = (env as typeof env & { IMAGES?: CloudflareImagesBinding }).IMAGES
    const waitUntil =
      ctx && typeof ctx.waitUntil === 'function' ? ctx.waitUntil.bind(ctx) : undefined
    return { images, waitUntil }
  } catch {
    return {}
  }
}

export async function evictThumbnailCache(fileId: string): Promise<void> {
  const edgeCache = getDefaultEdgeCache()
  if (!edgeCache) return

  const variants: ThumbnailVariant[] = ['grid', 'list']
  const exts: Array<'webp' | 'jpeg'> = ['webp', 'jpeg']

  await Promise.allSettled(
    variants.flatMap((variant) =>
      exts.map((ext) => edgeCache.delete(buildThumbnailCacheKey(fileId, variant, ext))),
    ),
  )
}

export function isTransformableContentType(contentType: string | null): boolean {
  if (!contentType) return true
  const normalized = contentType.split(';')[0].trim().toLowerCase()
  if (!normalized || normalized === 'application/octet-stream') {
    return true
  }
  return TRANSFORMABLE_CONTENT_TYPES.has(normalized)
}
