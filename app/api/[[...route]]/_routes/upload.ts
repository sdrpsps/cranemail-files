import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { apiSuccess, apiError } from '@/lib/response'
import { SmarterMailClient } from '@/lib/smartermail'
import { getPublicUrl } from '@/lib/format'
import { buildShortUrl, insertFileWithShortCode } from '@/lib/shortlink'
import nodeCrypto from 'crypto'
import { callSmarterMail } from '../_middleware'

const uploadApp = new Hono()

// POST /
uploadApp.post('/', async (c) => {
  try {
    const body = await c.req.parseBody()
    const file = body.file

    if (!file || !(file instanceof File)) {
      return apiError(c, 'No file uploaded or invalid file format', 400)
    }

    const fileBuffer = Buffer.from(await file.arrayBuffer())
    const fileName = file.name || `web_upload_${Date.now()}`

    const uploadResult = await callSmarterMail(c, async ({ client, accessToken, user }) => {
      const folderPath = SmarterMailClient.getPublicFolder() + SmarterMailClient.getDatePath()

      // Fetch email address of the current user to tag database records
      const userSettings = await client.getUserSettings(accessToken)
      const userData = userSettings?.userData
      if (!userSettings || userSettings.success === false || !userData?.emailAddress) {
        throw new HTTPException(401, { message: 'Failed to fetch user email context' })
      }
      const email = userData.emailAddress || user.email

      // 1. Upload to SmarterMail storage
      const uploadRes = await client.uploadFile(accessToken, fileBuffer, fileName, folderPath)
      if (!uploadRes.success || !uploadRes.uploadData) {
        throw new Error(uploadRes.message || 'SmarterMail upload failed')
      }

      const fileMeta = uploadRes.uploadData[fileName]
      if (!fileMeta || !fileMeta.id) {
        throw new Error('Uploaded file metadata missing')
      }

      // 2. Generate public share link
      const linkResult = await client.generatePublicLink(accessToken, fileMeta.id)
      if (!linkResult.success || !linkResult.publicLink) {
        throw new Error(linkResult.message || 'Failed to generate public share link')
      }

      return {
        email,
        fileId: fileMeta.id,
        publicLink: getPublicUrl(linkResult.publicLink, user.serverUrl),
      }
    })

    // 3. Save uploaded file metadata to database
    const fileRecordId = nodeCrypto.randomUUID()
    const createdAt = new Date().toISOString()
    const shortCode = await insertFileWithShortCode({
      id: fileRecordId,
      email: uploadResult.email,
      fileId: uploadResult.fileId,
      fileName,
      publicLink: uploadResult.publicLink,
      size: file.size,
      source: 'web',
      createdAt,
    })

    return apiSuccess(c, {
      id: fileRecordId,
      fileName,
      publicLink: uploadResult.publicLink,
      shortCode,
      shortUrl: buildShortUrl(shortCode),
      size: file.size,
      createdAt,
    }, 'File uploaded successfully')
  } catch (error) {
    console.error('Web upload endpoint error:', error)
    if (error instanceof HTTPException) {
      return apiError(c, error.message, error.status)
    }
    const errorMessage = error instanceof Error ? error.message : 'An error occurred during file upload'
    return apiError(c, errorMessage, 500)
  }
})

export default uploadApp
