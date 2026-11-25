import { and, desc, eq, or } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { apiSuccess, apiError } from '@/lib/response'
import { cleanupEmptyDateFolders, SmarterMailClient } from '@/lib/smartermail'
import { getDb, uploadedFiles } from '@/lib/db'
import { getPublicUrl } from '@/lib/format'
import { assignShortCode, buildShortUrl, insertFileWithShortCode } from '@/lib/shortlink'
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

export default filesApp
