import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { apiSuccess, apiError } from '@/lib/response'
import { SmarterMailClient } from '@/lib/smartermail'
import { db } from '@/lib/db'
import nodeCrypto from 'crypto'
import { callSmarterMail } from '../_middleware'

const filesApp = new Hono()

// GET /
filesApp.get('/', async (c) => {
  try {
    const email = await callSmarterMail(c, async ({ client, accessToken, user }) => {
      const userSettings = await client.getUserSettings(accessToken)
      const userData = userSettings?.userData
      if (!userSettings || userSettings.success === false || !userData?.emailAddress) {
        throw new HTTPException(401, { message: 'Failed to fetch user email context' })
      }
      return userData.emailAddress || user.email
    })

    const result = await db.execute({
      sql: 'SELECT * FROM uploaded_files WHERE email = ? ORDER BY createdAt DESC',
      args: [email]
    })

    return apiSuccess(c, result.rows, 'Uploaded files retrieved successfully')
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

    const deleteResult = await callSmarterMail(c, async ({ client, accessToken, user }) => {
      const userSettings = await client.getUserSettings(accessToken)
      const userData = userSettings?.userData
      if (!userSettings || userSettings.success === false || !userData?.emailAddress) {
        throw new HTTPException(401, { message: 'Failed to fetch user email context' })
      }
      const email = userData.emailAddress || user.email

      // Check if the file belongs to this user
      const checkRes = await db.execute({
        sql: 'SELECT id, fileId, fileName FROM uploaded_files WHERE id = ? AND email = ? LIMIT 1',
        args: [id, email]
      })

      if (checkRes.rows.length === 0) {
        throw new HTTPException(404, { message: 'File not found or access denied' })
      }

      const file = checkRes.rows[0]
      const fileId = typeof file.fileId === 'string' ? file.fileId : ''
      if (!fileId) {
        throw new HTTPException(409, { message: 'Cannot delete workspace file because this file record is missing a file ID' })
      }

      const deleteRes = await client.deleteFiles(accessToken, [fileId])
      if (!deleteRes.success) {
        throw new Error(deleteRes.message || 'Failed to delete workspace file')
      }

      return {
        id,
        fileId,
        fileName: typeof file.fileName === 'string' ? file.fileName : undefined,
      }
    })

    // Delete from local DB only after the workspace file has been deleted.
    await db.execute({
      sql: 'DELETE FROM uploaded_files WHERE id = ?',
      args: [id]
    })

    return apiSuccess(c, deleteResult, 'Workspace file deleted successfully')
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
    const syncResult = await callSmarterMail(c, async ({ client, accessToken, user }) => {
      const userSettings = await client.getUserSettings(accessToken)
      const userData = userSettings?.userData
      if (!userSettings || userSettings.success === false || !userData?.emailAddress) {
        throw new HTTPException(401, { message: 'Failed to fetch user email context' })
      }
      const email = userData.emailAddress || user.email

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
            // Check if the file record is already in our DB (either by fileId or publicLink)
            const checkExist = await db.execute({
              sql: 'SELECT id FROM uploaded_files WHERE fileId = ? OR publicLink = ? LIMIT 1',
              args: [file.id, publicLink]
            })

            if (checkExist.rows.length === 0) {
              const fileRecordId = nodeCrypto.randomUUID()
              let createdAt = new Date().toISOString()
              if (file.dateAdded) {
                try {
                  createdAt = new Date(file.dateAdded).toISOString()
                } catch {
                  // Fallback
                }
              }

              await db.execute({
                sql: `INSERT INTO uploaded_files (id, email, fileId, fileName, publicLink, size, source, createdAt)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [
                  fileRecordId,
                  email,
                  file.id,
                  file.fileName,
                  publicLink,
                  file.size,
                  'workspace',
                  createdAt
                ]
              })
              syncedCount++
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

export default filesApp
