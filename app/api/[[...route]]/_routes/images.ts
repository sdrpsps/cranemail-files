import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { apiSuccess, apiError } from '@/lib/response'
import { SmarterMailClient } from '@/lib/smartermail'
import { db } from '@/lib/db'
import nodeCrypto from 'crypto'
import { callSmarterMail } from '../_middleware'

const imagesApp = new Hono()

// GET /
imagesApp.get('/', async (c) => {
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
      sql: 'SELECT * FROM uploaded_images WHERE email = ? ORDER BY createdAt DESC',
      args: [email]
    })

    return apiSuccess(c, result.rows, 'Uploaded images retrieved successfully')
  } catch (error) {
    console.error('Fetch images error:', error)
    if (error instanceof HTTPException) {
      return apiError(c, error.message, error.status)
    }
    const errorMessage = error instanceof Error ? error.message : 'An error occurred while fetching images'
    return apiError(c, errorMessage, 500)
  }
})

// DELETE /:id
imagesApp.delete('/:id', async (c) => {
  try {
    const id = c.req.param('id')
    if (!id) {
      return apiError(c, 'Image ID is required', 400)
    }

    const deleteResult = await callSmarterMail(c, async ({ client, accessToken, user }) => {
      const userSettings = await client.getUserSettings(accessToken)
      const userData = userSettings?.userData
      if (!userSettings || userSettings.success === false || !userData?.emailAddress) {
        throw new HTTPException(401, { message: 'Failed to fetch user email context' })
      }
      const email = userData.emailAddress || user.email

      // Check if the image belongs to this user
      const checkRes = await db.execute({
        sql: 'SELECT id, fileId, fileName FROM uploaded_images WHERE id = ? AND email = ? LIMIT 1',
        args: [id, email]
      })

      if (checkRes.rows.length === 0) {
        throw new HTTPException(404, { message: 'Image not found or access denied' })
      }

      const image = checkRes.rows[0]
      const fileId = typeof image.fileId === 'string' ? image.fileId : ''
      if (!fileId) {
        throw new HTTPException(409, { message: 'Cannot delete workspace file because this image record is missing a file ID' })
      }

      const deleteRes = await client.deleteFiles(accessToken, [fileId])
      if (!deleteRes.success) {
        throw new Error(deleteRes.message || 'Failed to delete workspace file')
      }

      return {
        id,
        fileId,
        fileName: typeof image.fileName === 'string' ? image.fileName : undefined,
      }
    })

    // Delete from local DB only after the workspace file has been deleted.
    await db.execute({
      sql: 'DELETE FROM uploaded_images WHERE id = ?',
      args: [id]
    })

    return apiSuccess(c, deleteResult, 'Workspace file deleted successfully')
  } catch (error) {
    console.error('Delete image error:', error)
    if (error instanceof HTTPException) {
      return apiError(c, error.message, error.status)
    }
    const errorMessage = error instanceof Error ? error.message : 'An error occurred while deleting image'
    return apiError(c, errorMessage, 500)
  }
})

// POST /sync
imagesApp.post('/sync', async (c) => {
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
          // Only sync images
          if (/\.(jpg|jpeg|png|gif|webp)$/i.test(file.fileName)) {
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
              // Check if the image record is already in our DB (either by fileId or publicLink)
              const checkExist = await db.execute({
                sql: 'SELECT id FROM uploaded_images WHERE fileId = ? OR publicLink = ? LIMIT 1',
                args: [file.id, publicLink]
              })

              if (checkExist.rows.length === 0) {
                const imageId = nodeCrypto.randomUUID()
                let createdAt = new Date().toISOString()
                if (file.dateAdded) {
                  try {
                    createdAt = new Date(file.dateAdded).toISOString()
                  } catch {
                    // Fallback
                  }
                }

                await db.execute({
                  sql: `INSERT INTO uploaded_images (id, email, fileId, fileName, publicLink, size, source, createdAt)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                  args: [
                    imageId,
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

    return apiSuccess(c, { syncedCount: syncResult.syncedCount }, `Successfully synced ${syncResult.syncedCount} new workspace images`)
  } catch (error) {
    console.error('Workspace sync error:', error)
    if (error instanceof HTTPException) {
      return apiError(c, error.message, error.status)
    }
    const errorMessage = error instanceof Error ? error.message : 'An error occurred during synchronization'
    return apiError(c, errorMessage, 500)
  }
})

export default imagesApp
