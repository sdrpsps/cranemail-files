import { and, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { getDb, uploadedFiles, webUploads } from '@/lib/db'
import { getPublicUrl } from '@/lib/format'
import { apiError, apiSuccess } from '@/lib/response'
import { buildShortUrl } from '@/lib/shortlink'
import { withShortCodeRetry } from '@/lib/shortlink-code'
import { SmarterMailClient, SmarterMailHttpError } from '@/lib/smartermail'
import { callSmarterMail, requireCurrentUser } from '../_middleware'

const uploadApp = new Hono()

type UploadReceipt = typeof webUploads.$inferSelect

function readUploadHeaders(headers: Headers) {
  const requestId = headers.get('X-Upload-Id') ?? ''
  const encodedName = headers.get('X-Upload-Name') ?? ''
  const declaredSize = headers.get('X-Upload-Size') ?? ''
  let fileName
  try {
    fileName = decodeURIComponent(encodedName)
  } catch {
    throw new HTTPException(400, { message: 'Invalid upload filename.' })
  }

  const size = Number(declaredSize)
  const contentLength = headers.get('Content-Length')
  if (!/^[A-Za-z0-9-]{16,80}$/.test(requestId) ||
    !/^\d+$/.test(declaredSize) || !Number.isSafeInteger(size) ||
    (contentLength !== null && Number(contentLength) !== size)) {
    throw new HTTPException(400, { message: 'Invalid upload metadata.' })
  }
  if (!fileName || /[/\\]/.test(fileName) ||
    Array.from(fileName).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)) {
    throw new HTTPException(400, { message: 'Invalid upload filename.' })
  }

  const configuredLimit = process.env.UPLOAD_MAX_BYTES
  if (configuredLimit) {
    const limit = Number(configuredLimit)
    if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('Invalid UPLOAD_MAX_BYTES configuration.')
    if (size > limit) throw new HTTPException(413, { message: 'The file exceeds the upload size limit.' })
  }
  return { requestId, fileName, size }
}

async function finishUpload(receipt: UploadReceipt, email: string) {
  const findFile = async () => {
    const [file] = await getDb().select().from(uploadedFiles).where(eq(uploadedFiles.id, receipt.recordId)).limit(1)
    return file
  }

  let indexed = await findFile()
  if (!indexed) {
    const fileId = receipt.fileId
    if (!fileId) {
      throw new HTTPException(409, { message: 'This upload is still in progress or its result is unconfirmed. Sync your files to check CraneMail.' })
    }
    const publicLink = await callSmarterMail(receipt.userId, async ({ client, accessToken, user }) => {
      if (user.serverUrl !== receipt.serverUrl) {
        throw new HTTPException(409, { message: 'The account server changed since this upload started.' })
      }
      const share = await client.generatePublicLink(accessToken, fileId)
      if (!share.success || !share.publicLink) {
        throw new HTTPException(502, { message: 'CraneMail stored the file but could not generate a public link.' })
      }
      return getPublicUrl(share.publicLink, user.serverUrl)
    })
    const { result } = await withShortCodeRetry((shortCode) => getDb().insert(uploadedFiles).values({
      id: receipt.recordId,
      email,
      fileId,
      fileName: receipt.fileName,
      publicLink,
      shortCode,
      size: receipt.size,
      source: 'web',
      createdAt: receipt.createdAt,
    }).onConflictDoNothing({ target: uploadedFiles.id }).returning())
    indexed = result[0] ?? await findFile()
  }

  if (!indexed?.shortCode || !indexed.publicLink) throw new Error('The uploaded file index is incomplete.')
  return {
    id: indexed.id,
    fileName: receipt.fileName,
    publicLink: indexed.publicLink,
    shortCode: indexed.shortCode,
    shortUrl: buildShortUrl(indexed.shortCode),
    size: receipt.size,
    createdAt: indexed.createdAt,
  }
}

uploadApp.post('/', async (c) => {
  try {
    const { id: userId, email } = await requireCurrentUser(c)
    const request = c.req.raw
    const metadata = readUploadHeaders(request.headers)
    const { requestId, fileName, size } = metadata
    const condition = and(eq(webUploads.userId, userId), eq(webUploads.requestId, requestId))
    const findReceipt = async () => {
      const [receipt] = await getDb().select().from(webUploads).where(condition).limit(1)
      return receipt
    }

    let receipt = await findReceipt()
    if (!receipt) {
      const file = request.body ?? (size === 0 ? new Blob().stream() : null)
      if (!file) return apiError(c, 'The upload body is missing.', 400)
      request.signal.throwIfAborted()

      const folderPath = SmarterMailClient.getPublicFolder() + SmarterMailClient.getDatePath()
      const auth = await callSmarterMail(userId, async (context) => {
        await context.client.ensureFolderExists(context.accessToken, folderPath)
        return context
      })
      request.signal.throwIfAborted()
      const [claimed] = await getDb().insert(webUploads).values({
        ...metadata,
        userId,
        recordId: crypto.randomUUID(),
        serverUrl: auth.user.serverUrl,
        createdAt: new Date().toISOString(),
      }).onConflictDoNothing().returning()

      if (claimed) {
        const upload = await auth.client.sendFileStream(auth.accessToken, file, {
          fileName, size, folderPath, mode: 'fixed', signal: request.signal,
        })
        if (!upload.success) return apiError(c, 'CraneMail could not store the file.', 502)

        const fileId = upload.uploadData?.[fileName]?.id ?? await callSmarterMail(userId, async ({ client, accessToken, user }) => {
          if (user.serverUrl !== auth.user.serverUrl) throw new Error('The account server changed during the upload.')
          const recovered = await client.recoverUploadMetadata(accessToken, upload, fileName, size, folderPath)
          return recovered.uploadData?.[fileName]?.id
        })
        if (!fileId) return apiError(c, 'CraneMail did not return a file ID. Sync your files to check the upload.', 502)
        await getDb().update(webUploads).set({ fileId }).where(condition)
        receipt = { ...claimed, fileId }
      } else {
        receipt = await findReceipt()
      }
    }

    if (!receipt || receipt.fileName !== fileName || receipt.size !== size) {
      return apiError(c, 'The upload ID was already used for another file.', 409)
    }
    return apiSuccess(c, await finishUpload(receipt, email), 'File uploaded successfully')
  } catch (error) {
    if (c.req.raw.signal.aborted) return apiError(c, 'Upload canceled.', 408)
    if (error instanceof HTTPException) return apiError(c, error.message, error.status)
    if (error instanceof SmarterMailHttpError) {
      return apiError(c, 'CraneMail could not complete the upload. Sync your files to check its status.', 502)
    }
    console.error('Web upload endpoint error:', error)
    return apiError(c, 'Could not complete the upload. Sync your files to check its status.', 502)
  }
})

export default uploadApp
