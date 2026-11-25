import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { after, before, mock, test } from 'node:test'
import { SmarterMailClient } from '../lib/smartermail'
import { THUMBNAIL_MAX_SOURCE_BYTES } from '../lib/format'
import {
  UPSTREAM_FETCH_TIMEOUT_MS,
  type CloudflareImagesBinding,
  type CloudflareImagesOutputOptions,
  type CloudflareImagesTransformOptions,
} from '../lib/thumbnail'
import { createTestDatabase } from './d1-fixture'

const ownerEmail = 'thumb-owner@example.com'
const otherEmail = 'thumb-other@example.com'
const ownerUserId = 'thumb-owner-id'
const authCookie = '__Secure-better-auth.session_token'

let database: Awaited<ReturnType<typeof createTestDatabase>>
let handleApiRequest: typeof import('../lib/api').handleApiRequest
let cookie = ''

const contextKey = Symbol.for('__cloudflare-context__')
let originalImages: unknown
let originalCachesDescriptor: PropertyDescriptor | undefined

interface TransformRecord {
  transform: CloudflareImagesTransformOptions
  output: CloudflareImagesOutputOptions
}

function getPlatformEnv(): Record<string, unknown> {
  const ctx = Reflect.get(globalThis, contextKey) as { env: Record<string, unknown> }
  return ctx.env
}

function createMockImagesBinding(
  calls: TransformRecord[],
  options: { fail?: boolean; bytes?: Uint8Array<ArrayBuffer> } = {},
): CloudflareImagesBinding {
  return {
    input(stream: ReadableStream<Uint8Array>) {
      return {
        transform(transformOpts: CloudflareImagesTransformOptions) {
          return {
            async output(outputOpts: CloudflareImagesOutputOptions) {
              await new Response(stream).arrayBuffer()
              if (options.fail) {
                throw new Error('ERROR 9422: Transformations quota exceeded')
              }
              calls.push({ transform: transformOpts, output: outputOpts })
              const body =
                options.bytes ??
                (new TextEncoder().encode(`thumb:${outputOpts.format}`) as Uint8Array<ArrayBuffer>)
              return {
                response: () =>
                  new Response(body, {
                    status: 200,
                    headers: { 'Content-Type': outputOpts.format },
                  }),
                contentType: () => outputOpts.format,
                image: () => new Response(body).body!,
              }
            },
          }
        },
      }
    },
  }
}

function createMockCacheStorage() {
  const store = new Map<string, Response>()
  const cache: Cache = {
    async match(request: RequestInfo | URL) {
      const key = request instanceof Request ? request.url : String(request)
      const hit = store.get(key)
      return hit ? hit.clone() : undefined
    },
    async put(request: RequestInfo | URL, response: Response) {
      const key = request instanceof Request ? request.url : String(request)
      const cacheControl = response.headers.get('Cache-Control') ?? ''
      if (cacheControl.includes('private') || response.headers.has('Set-Cookie')) {
        throw new TypeError('Cloudflare Cache API rejects private or Set-Cookie responses')
      }
      store.set(key, response.clone())
    },
    async delete(request: RequestInfo | URL) {
      const key = request instanceof Request ? request.url : String(request)
      return store.delete(key)
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
  return { store, cache }
}

before(async () => {
  process.env.NEXT_PUBLIC_SITE_URL = 'https://site.example'
  process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex')
  process.env.ENCRYPTION_KEY = 'thumbnail-test-key'

  originalCachesDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'caches')
  database = await createTestDatabase()
  await database.migrate()
  originalImages = getPlatformEnv().IMAGES

  await database.db.insert(database.users).values({ id: ownerUserId, email: ownerEmail })
  await database.db.insert(database.uploadedFiles).values([
    {
      id: 'img-png',
      email: ownerEmail,
      fileId: 'remote-png',
      fileName: 'photo.png',
      publicLink: 'https://cdn.example/photo.png',
      shortCode: 'thmb001',
      size: 2048,
      source: 'web',
    },
    {
      id: 'img-svg',
      email: ownerEmail,
      fileId: 'remote-svg',
      fileName: 'logo.svg',
      publicLink: 'https://cdn.example/logo.svg',
      shortCode: 'thmb002',
      size: 512,
      source: 'web',
    },
    {
      id: 'img-gif',
      email: ownerEmail,
      fileId: 'remote-gif',
      fileName: 'anim.gif',
      publicLink: 'https://cdn.example/anim.gif',
      shortCode: 'thmb003',
      size: 1024,
      source: 'web',
    },
    {
      id: 'file-pdf',
      email: ownerEmail,
      fileId: 'remote-pdf',
      fileName: 'doc.pdf',
      publicLink: 'https://cdn.example/doc.pdf',
      shortCode: 'thmb004',
      size: 4096,
      source: 'web',
    },
    {
      id: 'img-huge',
      email: ownerEmail,
      fileId: 'remote-huge',
      fileName: 'huge.jpg',
      publicLink: 'https://cdn.example/huge.jpg',
      shortCode: 'thmb005',
      size: THUMBNAIL_MAX_SOURCE_BYTES + 1,
      source: 'web',
    },
    {
      id: 'img-other',
      email: otherEmail,
      fileId: 'remote-other',
      fileName: 'secret.png',
      publicLink: 'https://cdn.example/secret.png',
      shortCode: 'thmb006',
      size: 1024,
      source: 'web',
    },
  ])

  handleApiRequest = (await import('../lib/api')).handleApiRequest

  mock.method(SmarterMailClient.prototype, 'authenticateUser', async () => ({
    success: true,
    emailAddress: ownerEmail,
    username: 'thumb-owner',
    isAdmin: false,
    isDomainAdmin: false,
    accessToken: 'thumb-access',
    refreshToken: 'thumb-refresh',
    accessTokenExpiration: new Date(Date.now() + 86_400_000).toISOString(),
    refreshTokenExpiration: new Date(Date.now() + 172_800_000).toISOString(),
  }))
  mock.method(SmarterMailClient.prototype, 'deleteFiles', async () => ({ success: true }))

  const login = await handleApiRequest(
    new Request('https://site.example/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: 'https://site.example' },
      body: JSON.stringify({
        username: ownerEmail,
        password: 'pw',
        serverUrl: 'https://cdn.example',
      }),
    }),
  )
  assert.equal(login.status, 200)
  const sessionCookie = login.headers
    .getSetCookie()
    .find((value) => value.startsWith(`${authCookie}=`))
  assert.ok(sessionCookie)
  cookie = sessionCookie.split(';')[0]
})

after(async () => {
  mock.restoreAll()
  if (database) {
    getPlatformEnv().IMAGES = originalImages
  }
  if (originalCachesDescriptor) {
    Object.defineProperty(globalThis, 'caches', originalCachesDescriptor)
  } else {
    Reflect.deleteProperty(globalThis, 'caches')
  }
  await database?.dispose()
})

function setMockCaches(cache: Cache | undefined) {
  Object.defineProperty(globalThis, 'caches', {
    configurable: true,
    writable: true,
    value: cache ? { default: cache } : undefined,
  })
}

test('unauthenticated requests to thumbnail return 401', async () => {
  const res = await handleApiRequest(
    new Request('https://site.example/api/files/img-png/thumbnail'),
  )
  assert.equal(res.status, 401)
})

test('unknown or other-user files return 404 even when cached', async () => {
  const { cache } = createMockCacheStorage()
  setMockCaches(cache)
  await cache.put(
    new Request('https://thumbnail-cache.internal/v1/img-other/grid/webp'),
    new Response('secret', { status: 200, headers: { 'Cache-Control': 'public, max-age=60' } }),
  )

  const otherRes = await handleApiRequest(
    new Request('https://site.example/api/files/img-other/thumbnail', {
      headers: { Cookie: cookie },
    }),
  )
  assert.equal(otherRes.status, 404)

  const missingRes = await handleApiRequest(
    new Request('https://site.example/api/files/does-not-exist/thumbnail', {
      headers: { Cookie: cookie },
    }),
  )
  assert.equal(missingRes.status, 404)
})

test('invalid thumbnail variant returns 400', async () => {
  const res = await handleApiRequest(
    new Request('https://site.example/api/files/img-png/thumbnail?variant=huge', {
      headers: { Cookie: cookie },
    }),
  )
  assert.equal(res.status, 400)
})

test('grid and list variants transform via IMAGES, negotiate format, cache in edges, and evict on delete', async (t) => {
  const calls: TransformRecord[] = []
  const { store, cache } = createMockCacheStorage()
  setMockCaches(cache)
  getPlatformEnv().IMAGES = createMockImagesBinding(calls)

  let fetchCalls = 0
  t.mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0]) => {
    assert.equal(String(input), 'https://cdn.example/photo.png')
    fetchCalls += 1
    return new Response(new Uint8Array([137, 80, 78, 71]), {
      status: 200,
      headers: { 'Content-Type': 'image/png' },
    })
  })

  try {
    // 1. Default omitted variant -> grid + WebP + MISS
    const gridRes = await handleApiRequest(
      new Request('https://site.example/api/files/img-png/thumbnail', {
        headers: { Cookie: cookie, Accept: 'image/webp,image/png,*/*' },
      }),
    )
    assert.equal(gridRes.status, 200)
    assert.equal(gridRes.headers.get('Content-Type'), 'image/webp')
    assert.equal(gridRes.headers.get('Cache-Control'), 'private, max-age=604800, immutable')
    assert.equal(gridRes.headers.get('Vary'), 'Accept')
    assert.equal(gridRes.headers.get('X-Robots-Tag'), 'noindex, nofollow')
    assert.equal(gridRes.headers.get('X-Thumbnail-Cache'), 'MISS')
    assert.equal(await gridRes.text(), 'thumb:image/webp')
    assert.deepEqual(calls[0], {
      transform: { width: 640, height: 640, fit: 'scale-down' },
      output: { format: 'image/webp', quality: 80 },
    })
    assert.equal(fetchCalls, 1)

    // Verify edge cache entry has public Cache-Control and no Set-Cookie
    const cachedGrid = store.get('https://thumbnail-cache.internal/v1/img-png/grid/webp')
    assert.ok(cachedGrid)
    assert.equal(cachedGrid.headers.get('Cache-Control'), 'public, max-age=604800, immutable')
    assert.equal(cachedGrid.headers.get('Set-Cookie'), null)

    // 2. Second request for grid -> HIT without calling fetch or IMAGES
    const gridHitRes = await handleApiRequest(
      new Request('https://site.example/api/files/img-png/thumbnail?variant=grid', {
        headers: { Cookie: cookie, Accept: 'image/webp,*/*' },
      }),
    )
    assert.equal(gridHitRes.status, 200)
    assert.equal(gridHitRes.headers.get('X-Thumbnail-Cache'), 'HIT')
    assert.equal(await gridHitRes.text(), 'thumb:image/webp')
    assert.equal(fetchCalls, 1)
    assert.equal(calls.length, 1)

    // 3. List variant
    const listRes = await handleApiRequest(
      new Request('https://site.example/api/files/img-png/thumbnail?variant=list', {
        headers: { Cookie: cookie },
      }),
    )
    assert.equal(listRes.status, 200)
    assert.equal(listRes.headers.get('X-Thumbnail-Cache'), 'MISS')
    assert.deepEqual(calls[1], {
      transform: { width: 96, height: 96, fit: 'cover' },
      output: { format: 'image/webp', quality: 75 },
    })

    // 4. Accept: image/jpeg negotiates JPEG
    const jpegRes = await handleApiRequest(
      new Request('https://site.example/api/files/img-png/thumbnail?variant=grid', {
        headers: { Cookie: cookie, Accept: 'image/jpeg, image/png' },
      }),
    )
    assert.equal(jpegRes.status, 200)
    assert.equal(jpegRes.headers.get('Content-Type'), 'image/jpeg')
    assert.equal(await jpegRes.text(), 'thumb:image/jpeg')
    assert.equal(calls[2].output.format, 'image/jpeg')

    // 5. Deleting file evicts all cached variants
    assert.ok(store.size >= 3)
    const delRes = await handleApiRequest(
      new Request('https://site.example/api/files/img-png', {
        method: 'DELETE',
        headers: { Cookie: cookie },
      }),
    )
    assert.equal(delRes.status, 200)
    assert.equal(store.size, 0)
  } finally {
    getPlatformEnv().IMAGES = originalImages
    setMockCaches(undefined)
  }
})

test('non-transformable files redirect 302 to original URL without fetching upstream', async (t) => {
  assert.equal(UPSTREAM_FETCH_TIMEOUT_MS, 10_000)
  const fetchMock = t.mock.method(globalThis, 'fetch', async () => {
    assert.fail('Non-transformable files should redirect without fetching upstream')
  })
  getPlatformEnv().IMAGES = createMockImagesBinding([])

  try {
    for (const [id, expectedUrl] of [
      ['img-svg', 'https://cdn.example/logo.svg'],
      ['img-gif', 'https://cdn.example/anim.gif'],
      ['file-pdf', 'https://cdn.example/doc.pdf'],
      ['img-huge', 'https://cdn.example/huge.jpg'],
    ]) {
      const res = await handleApiRequest(
        new Request(`https://site.example/api/files/${id}/thumbnail`, {
          headers: { Cookie: cookie },
        }),
      )
      assert.equal(res.status, 302)
      assert.equal(res.headers.get('Location'), expectedUrl)
      assert.equal(res.headers.get('Cache-Control'), 'private, no-store')
      assert.equal(res.headers.get('X-Thumbnail-Fallback'), 'non-transformable')
    }
    assert.equal(fetchMock.mock.callCount(), 0)
  } finally {
    getPlatformEnv().IMAGES = originalImages
  }
})

test('falls back to 302 original when IMAGES binding is missing or errors or upstream is invalid', async (t) => {
  await database.db.insert(database.uploadedFiles).values({
    id: 'img-fallback',
    email: ownerEmail,
    fileId: 'remote-fallback',
    fileName: 'fallback.jpg',
    publicLink: 'https://cdn.example/fallback.jpg',
    shortCode: 'thmb007',
    size: 1024,
    source: 'web',
  })

  try {
    // 1. Missing IMAGES binding
    getPlatformEnv().IMAGES = undefined
    const noBindingRes = await handleApiRequest(
      new Request('https://site.example/api/files/img-fallback/thumbnail', {
        headers: { Cookie: cookie },
      }),
    )
    assert.equal(noBindingRes.status, 302)
    assert.equal(noBindingRes.headers.get('Location'), 'https://cdn.example/fallback.jpg')
    assert.equal(noBindingRes.headers.get('Cache-Control'), 'private, no-store')
    assert.equal(noBindingRes.headers.get('X-Thumbnail-Fallback'), 'no-binding')

    // 2. IMAGES throws (e.g. quota 9422)
    getPlatformEnv().IMAGES = createMockImagesBinding([], { fail: true })
    let upstreamMode: 'ok' | 'bad-status' | 'svg' | 'oversized' = 'ok'
    t.mock.method(globalThis, 'fetch', async () => {
      if (upstreamMode === 'bad-status') {
        return new Response('not found', { status: 404 })
      }
      if (upstreamMode === 'svg') {
        return new Response('<svg/>', {
          status: 200,
          headers: { 'Content-Type': 'image/svg+xml' },
        })
      }
      if (upstreamMode === 'oversized') {
        return new Response('x', {
          status: 200,
          headers: {
            'Content-Type': 'image/jpeg',
            'Content-Length': String(THUMBNAIL_MAX_SOURCE_BYTES + 1),
          },
        })
      }
      return new Response('jpeg-bytes', {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg' },
      })
    })

    const quotaErrRes = await handleApiRequest(
      new Request('https://site.example/api/files/img-fallback/thumbnail', {
        headers: { Cookie: cookie },
      }),
    )
    assert.equal(quotaErrRes.status, 302)
    assert.equal(quotaErrRes.headers.get('Location'), 'https://cdn.example/fallback.jpg')
    assert.equal(quotaErrRes.headers.get('X-Thumbnail-Fallback'), 'transform-error')

    // 3. Upstream non-200, svg Content-Type, or oversized Content-Length
    getPlatformEnv().IMAGES = createMockImagesBinding([])
    for (const [mode, expectedReason] of [
      ['bad-status', 'upstream-status'],
      ['svg', 'content-type'],
      ['oversized', 'oversized'],
    ] as const) {
      upstreamMode = mode
      const res = await handleApiRequest(
        new Request('https://site.example/api/files/img-fallback/thumbnail', {
          headers: { Cookie: cookie },
        }),
      )
      assert.equal(res.status, 302)
      assert.equal(res.headers.get('Location'), 'https://cdn.example/fallback.jpg')
      assert.equal(res.headers.get('Cache-Control'), 'private, no-store')
      assert.equal(res.headers.get('X-Thumbnail-Fallback'), expectedReason)
    }
  } finally {
    getPlatformEnv().IMAGES = originalImages
  }
})
