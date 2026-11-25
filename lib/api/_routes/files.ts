import { and, desc, eq, or } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { apiSuccess, apiError } from '@/lib/response'
import { cleanupEmptyDateFolders, SmarterMailClient } from '@/lib/smartermail'
import { getDb, uploadedFiles } from '@/lib/db'
import {
  getPublicUrl,
  isTransformableImageFile,
  THUMBNAIL_MAX_SOURCE_BYTES,
} from '@/lib/format'
import { assignShortCode, buildShortUrl, insertFileWithShortCode } from '@/lib/shortlink'
import {
  buildThumbnailCacheKey,
  evictThumbnailCache,
  getDefaultEdgeCache,
  getImagesRuntime,
  isTransformableContentType,
  parseThumbnailVariant,
  selectThumbnailOutputFormat,
  THUMBNAIL_CACHE_CONTROL_CLIENT,
  THUMBNAIL_CACHE_CONTROL_EDGE,
  THUMBNAIL_FALLBACK_CACHE_CONTROL,
  THUMBNAIL_PRESETS,
  UPSTREAM_FETCH_TIMEOUT_MS,
} from '@/lib/thumbnail'
import nodeCrypto from 'crypto'
import { callSmarterMail, requireCurrentUser } from '../_middleware'

const filesApp = new Hono()

// GET /
filesApp.get('/', async (c) => {
  c.header('Cache-Control', 'no-store')
  try {
    const { email } = await requireCurrentUser(c)

    const files = await getDb()
      .select()
      .from(uploadedFiles)
      .where(eq(uploadedFiles.email, email))
      .orderBy(desc(uploadedFiles.createdAt))

    return apiSuccess(c, files.map((file) => ({
      ...file,
      shortUrl: file.shortCode ? buildShortUrl(file.shortCode) : undefined,
    })), 'Uploaded files retrieved successfully')
  } catch (error) {
    console.error('Fetch files error:', error)
    if (error instanceof HTTPException) {
      return apiError(c, error.message, error.status)
    }
    const errorMessage = error instanceof Error ? error.message : 'An error occurred while fetching files'
    return apiError(c, errorMessage, 500)
  }
})

// DELETE /:id
filesApp.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    if (!id) {
      return apiError(c, 'File ID is required', 400)
    }

    const { id: userId, email } = await requireCurrentUser(c)
    const ownedFile = and(eq(uploadedFiles.id, id), eq(uploadedFiles.email, email))
    const db = getDb()
    const [file] = await db
      .select({
        fileId: uploadedFiles.fileId,
        fileName: uploadedFiles.fileName,
      })
      .from(uploadedFiles)
      .where(ownedFile)
      .limit(1)

    if (!file) {
      return apiError(c, 'File not found or access denied', 404)
    }

    const { fileId } = file
    if (!fileId) {
      return apiError(c, 'Cannot delete workspace file because this file record is missing a file ID', 409)
    }

    const deleteResult = await callSmarterMail(userId, ({ client, accessToken }) =>
      client.deleteFiles(accessToken, [fileId]))
    if (!deleteResult.success) {
      throw new Error(deleteResult.message || 'Failed to delete workspace file')
    }
    // Delete from local DB only after the workspace file has been deleted.
    await db.delete(uploadedFiles).where(ownedFile)
    const { waitUntil } = getImagesRuntime()
    const eviction = evictThumbnailCache(id)
    if (waitUntil) waitUntil(eviction)
    else await eviction

    return apiSuccess(c, {
      id,
      fileId,
      fileName: file.fileName ?? undefined,
    }, 'Workspace file deleted successfully')
  } catch (error) {
    console.error('Delete file error:', error)
    if (error instanceof HTTPException) {
      return apiError(c, error.message, error.status)
    }
    const errorMessage = error instanceof Error ? error.message : 'An error occurred while deleting file'
    return apiError(c, errorMessage, 500)
  }
})

// POST /sync
filesApp.post('/sync', async (c) => {
  try {
    const { id: userId, email } = await requireCurrentUser(c)
    const syncResult = await callSmarterMail(userId, async ({ client, accessToken, user }) => {
      let syncedCount = 0

      // Recursive folder scanning function
      const walkFolder = async (folderPath: string) => {
        const res = await client.getFolder(accessToken, folderPath)
        if (!res.success || !res.folder) {
          console.warn(`[Sync] Failed to list folder "${folderPath}":`, res.message)
          return
        }

        // 1. Process files in current folder
        const files = res.folder.files || []
        for (const file of files) {
          let publicLink = file.publicDownloadLink

          // Generate public link if not already generated/published
          if (!publicLink) {
            try {
              const linkRes = await client.generatePublicLink(accessToken, file.id)
              if (linkRes.success && linkRes.publicLink) {
                publicLink = linkRes.publicLink
              }
            } catch (linkErr) {
              console.warn(`[Sync] Failed to generate public link for file "${file.fileName}" (${file.id}):`, linkErr)
            }
          }

          if (publicLink) {
            const publicUrl = getPublicUrl(publicLink, user.serverUrl)
            // Check if the file record is already in our DB (either by fileId or publicLink)
            const [existingFile] = await getDb()
              .select({ id: uploadedFiles.id, shortCode: uploadedFiles.shortCode })
              .from(uploadedFiles)
              .where(
                and(
                  eq(uploadedFiles.email, email),
                  or(
                    eq(uploadedFiles.fileId, file.id),
                    eq(uploadedFiles.publicLink, publicLink),
                    eq(uploadedFiles.publicLink, publicUrl),
                  ),
                ),
              )
              .limit(1)

            if (!existingFile) {
              const fileRecordId = nodeCrypto.randomUUID()
              let createdAt = new Date().toISOString()
              if (file.dateAdded) {
                try {
                  createdAt = new Date(file.dateAdded).toISOString()
                } catch {
                  // Fallback
                }
              }

              await insertFileWithShortCode({
                id: fileRecordId,
                email,
                fileId: file.id,
                fileName: file.fileName,
                publicLink: publicUrl,
                size: file.size,
                source: 'workspace',
                createdAt,
              })
              syncedCount++
            } else if (!existingFile.shortCode) {
              await assignShortCode(existingFile.id)
            }
          }
        }

        // 2. Recurse into subdirectories
        const subFolders = res.folder.subFolders || []
        for (const sub of subFolders) {
          if (sub.path) {
            await walkFolder(sub.path)
          }
        }
      }

      // Start scanning from public folder path
      await walkFolder(SmarterMailClient.getPublicFolder())
      return { syncedCount }
    })

    return apiSuccess(c, { syncedCount: syncResult.syncedCount }, `Successfully synced ${syncResult.syncedCount} new workspace files`)
  } catch (error) {
    console.error('Workspace sync error:', error)
    if (error instanceof HTTPException) {
      return apiError(c, error.message, error.status)
    }
    const errorMessage = error instanceof Error ? error.message : 'An error occurred during synchronization'
    return apiError(c, errorMessage, 500)
  }
})

// POST /cleanup-folders
filesApp.post('/cleanup-folders', async (c) => {
  try {
    const { id: userId } = await requireCurrentUser(c)
    const result = await callSmarterMail(userId, async ({ client, accessToken }) => {
      return cleanupEmptyDateFolders(client, accessToken)
    })

    const message =
      result.deletedCount > 0
        ? `Removed ${result.deletedCount} empty date folder(s)`
        : 'No empty date folders found'

    return apiSuccess(c, result, message)
  } catch (error) {
    console.error('Empty folder cleanup error:', error)
    if (error instanceof HTTPException) {
      return apiError(c, error.message, error.status)
    }
    const errorMessage = error instanceof Error ? error.message : 'An error occurred while cleaning empty folders'
    return apiError(c, errorMessage, 500)
  }
})

// GET /:id/thumbnail
filesApp.get('/:id/thumbnail', async (c) => {
  try {
    const id = c.req.param('id')
    if (!id) {
      return apiError(c, 'File ID is required', 400)
    }

    const variant = parseThumbnailVariant(c.req.query('variant'))
    if (!variant) {
      return apiError(c, 'Invalid thumbnail variant', 400)
    }

    const { email, serverUrl } = await requireCurrentUser(c)
    const [file] = await getDb()
      .select({
        id: uploadedFiles.id,
        fileName: uploadedFiles.fileName,
        publicLink: uploadedFiles.publicLink,
        size: uploadedFiles.size,
      })
      .from(uploadedFiles)
      .where(and(eq(uploadedFiles.id, id), eq(uploadedFiles.email, email)))
      .limit(1)

    if (!file) {
      return apiError(c, 'File not found or access denied', 404)
    }

    const publicUrl = getPublicUrl(file.publicLink ?? '', serverUrl)
    let parsedUrl: URL
    try {
      parsedUrl = new URL(publicUrl)
    } catch {
      return apiError(c, 'File preview URL is unavailable', 404)
    }
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return apiError(c, 'File preview URL is unavailable', 404)
    }

    const fallbackToOriginal = (reason: string) => {
      c.header('Cache-Control', THUMBNAIL_FALLBACK_CACHE_CONTROL)
      c.header('X-Thumbnail-Fallback', reason)
      return c.redirect(parsedUrl.href, 302)
    }

    if (!file.fileName || !isTransformableImageFile(file.fileName, file.size ?? undefined)) {
      return fallbackToOriginal('non-transformable')
    }

    const { format, ext } = selectThumbnailOutputFormat(c.req.header('Accept') ?? null)
    const { images, waitUntil } = getImagesRuntime()
    if (!images) {
      return fallbackToOriginal('no-binding')
    }

    const edgeCache = getDefaultEdgeCache()
    const cacheKey = buildThumbnailCacheKey(file.id, variant, ext)
    if (edgeCache) {
      try {
        const cached = await edgeCache.match(cacheKey)
        if (cached) {
          const bytes = await cached.arrayBuffer()
          return c.body(bytes, 200, {
            'Content-Type': cached.headers.get('Content-Type') || format,
            'Cache-Control': THUMBNAIL_CACHE_CONTROL_CLIENT,
            Vary: 'Accept',
            'X-Thumbnail-Cache': 'HIT',
          })
        }
      } catch (cacheErr) {
        console.warn('[Thumbnail] Failed to read edge cache:', cacheErr)
      }
    }

    try {
      const upstream = await fetch(parsedUrl.href, {
        signal: AbortSignal.timeout(UPSTREAM_FETCH_TIMEOUT_MS),
        redirect: 'follow',
      })
      if (!upstream.ok || !upstream.body) {
        await upstream.body?.cancel().catch(() => {})
        return fallbackToOriginal('upstream-status')
      }

      const contentLengthHeader = upstream.headers.get('Content-Length')
      if (contentLengthHeader !== null) {
        const contentLength = Number(contentLengthHeader)
        if (Number.isFinite(contentLength) && contentLength > THUMBNAIL_MAX_SOURCE_BYTES) {
          await upstream.body.cancel().catch(() => {})
          return fallbackToOriginal('oversized')
        }
      }

      if (!isTransformableContentType(upstream.headers.get('Content-Type'))) {
        await upstream.body.cancel().catch(() => {})
        return fallbackToOriginal('content-type')
      }

      let imageInputStream: ReadableStream<Uint8Array> = upstream.body
      if (process.env.NODE_ENV === 'development') {
        const sourceBytes = await upstream.arrayBuffer()
        if (sourceBytes.byteLength === 0) {
          return fallbackToOriginal('upstream-status')
        }
        if (sourceBytes.byteLength > THUMBNAIL_MAX_SOURCE_BYTES) {
          return fallbackToOriginal('oversized')
        }
        imageInputStream = new Response(sourceBytes).body!
      }

      const preset = THUMBNAIL_PRESETS[variant]
      const transformed = await images
        .input(imageInputStream)
        .transform({ width: preset.width, height: preset.height, fit: preset.fit })
        .output({ format, quality: preset.quality })

      const transformedResponse = transformed.response()
      const outputContentType = transformedResponse.headers.get('Content-Type') || format
      const bytes = await transformedResponse.arrayBuffer()
      if (bytes.byteLength === 0) {
        return fallbackToOriginal('empty-output')
      }

      if (edgeCache) {
        const cacheResponse = new Response(bytes.slice(0), {
          status: 200,
          headers: {
            'Content-Type': outputContentType,
            'Cache-Control': THUMBNAIL_CACHE_CONTROL_EDGE,
          },
        })
        const putPromise = edgeCache.put(cacheKey, cacheResponse).catch((cacheErr) => {
          console.warn('[Thumbnail] Failed to write edge cache:', cacheErr)
        })
        if (waitUntil) waitUntil(putPromise)
        else await putPromise
      }

      return c.body(bytes, 200, {
        'Content-Type': outputContentType,
        'Cache-Control': THUMBNAIL_CACHE_CONTROL_CLIENT,
        Vary: 'Accept',
        'X-Thumbnail-Cache': 'MISS',
      })
    } catch (err) {
      console.warn('[Thumbnail] Falling back to original:', err)
      return fallbackToOriginal('transform-error')
    }
  } catch (error) {
    console.error('Thumbnail error:', error)
    if (error instanceof HTTPException) {
      return apiError(c, error.message, error.status)
    }
    const errorMessage = error instanceof Error ? error.message : 'An error occurred while loading thumbnail'
    return apiError(c, errorMessage, 500)
  }
})

export default filesApp
