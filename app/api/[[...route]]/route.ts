import { Hono, Context } from 'hono'
import { handle } from 'hono/vercel'
import { HTTPException } from 'hono/http-exception'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { apiSuccess, apiError } from '@/lib/response'
import { SmarterMailClient } from '@/lib/smartermail'
import { encrypt } from '@/lib/crypto'
import { db, initDb } from '@/lib/db'
import { handleTelegramUpdate } from '@/lib/bot'
import {
  AppUser,
  callSmarterMailForUser,
  resolveServerUrl,
  SmarterMailAuthContext,
  SmarterMailSessionError,
  upsertSmarterMailSession,
} from '@/lib/smartermail-session'
import nodeCrypto from 'crypto'

// Initialize Hono app. Setting the basePath allows matching subroutes correctly.
const app = new Hono().basePath('/api')

// Initialize DB tables asynchronously on module load
initDb().catch((err) => console.error('Database DDL initialization failed:', err))

// Global 404 Not Found Handler
app.notFound((c) => {
  return apiError(c, `Route not found: ${c.req.method} ${c.req.path}`, 404)
})

// Global Error Handler
app.onError((err, c) => {
  // Log the error locally for server-side monitoring
  console.error(`[API Error Log] ${c.req.method} ${c.req.path}:`, err)

  // Handle standard Hono HTTP Exceptions (e.g., manually thrown or from Hono middleware)
  if (err instanceof HTTPException) {
    return apiError(c, err.message, err.status)
  }

  // Handle general/unexpected runtime errors
  const isDev = process.env.NODE_ENV === 'development'
  const errorMessage = err.message || 'An unexpected error occurred'

  return apiError(
    c,
    isDev ? errorMessage : 'Internal Server Error',
    500,
    isDev ? { stack: err.stack } : undefined
  )
})

// Helper for secure cookie options
const isProd = process.env.NODE_ENV === 'production'
const getCookieOptions = (expiresStr?: string) => ({
  path: '/',
  httpOnly: true,
  secure: isProd,
  sameSite: 'Lax' as const,
  ...(expiresStr ? { expires: new Date(expiresStr) } : {}),
})
const APP_SESSION_COOKIE = 'app_session_id'
const APP_SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000

function clearAuthCookies(c: Context) {
  deleteCookie(c, APP_SESSION_COOKIE, { path: '/' })
}

function setAppSessionCookie(c: Context, sessionId: string, expiresAt: string) {
  setCookie(c, APP_SESSION_COOKIE, sessionId, getCookieOptions(expiresAt))
}

async function createAppSession(userId: string): Promise<{ id: string; expiresAt: string }> {
  const id = nodeCrypto.randomUUID()
  const expiresAt = new Date(Date.now() + APP_SESSION_DURATION_MS).toISOString()

  await db.execute({
    sql: `INSERT INTO app_sessions (id, userId, expiresAt, updatedAt)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP)`,
    args: [id, userId, expiresAt],
  })

  return { id, expiresAt }
}

async function getCurrentUser(c: Context): Promise<AppUser | null> {
  const sessionId = getCookie(c, APP_SESSION_COOKIE)
  if (!sessionId) {
    return null
  }

  const result = await db.execute({
    sql: `SELECT users.id, users.email, users.serverUrl, users.telegramUserId, users.encryptedPassword
          FROM app_sessions
          JOIN users ON users.id = app_sessions.userId
          WHERE app_sessions.id = ? AND app_sessions.expiresAt > ?
          LIMIT 1`,
    args: [sessionId, new Date().toISOString()],
  })

  const user = result.rows[0] as unknown as AppUser | undefined
  if (!user) {
    clearAuthCookies(c)
    return null
  }

  return user
}

async function requireCurrentUser(c: Context): Promise<AppUser> {
  const user = await getCurrentUser(c)
  if (!user) {
    throw new HTTPException(401, { message: 'Not authenticated' })
  }

  return user
}

async function callSmarterMail<T>(
  c: Context,
  operation: (context: SmarterMailAuthContext) => Promise<T>,
): Promise<T> {
  const user = await requireCurrentUser(c)

  try {
    return await callSmarterMailForUser(user.id, operation)
  } catch (err) {
    if (err instanceof SmarterMailSessionError) {
      throw new HTTPException(err.status === 403 ? 403 : 401, { message: err.message })
    }
    throw err
  }
}

// --- Authentication Endpoints ---

// POST /api/auth/login
app.post('/auth/login', async (c) => {
  try {
    const { username, password, serverUrl } = await c.req.json()

    if (!username || !password) {
      return apiError(c, 'Username and password are required', 400)
    }

    const resolvedServerUrl = resolveServerUrl(serverUrl)
    const client = new SmarterMailClient(resolvedServerUrl)
    const result = await client.authenticateUser(username, password)

    if (!result.success) {
      return apiError(c, result.message || 'Authentication failed', 401)
    }

    const encryptedPassword = encrypt(password)
    const newUserId = nodeCrypto.randomUUID()

    await db.execute({
      sql: `INSERT INTO users (id, email, serverUrl, encryptedPassword, updatedAt)
            VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
            ON CONFLICT(email) DO UPDATE SET
              serverUrl = excluded.serverUrl,
              encryptedPassword = excluded.encryptedPassword,
              updatedAt = CURRENT_TIMESTAMP`,
      args: [
        newUserId,
        result.emailAddress,
        resolvedServerUrl,
        encryptedPassword,
      ],
    })

    const userCheck = await db.execute({
      sql: 'SELECT id, telegramUserId FROM users WHERE email = ? LIMIT 1',
      args: [result.emailAddress],
    })
    const dbUser = userCheck.rows[0]
    const userId = String(dbUser.id)

    await upsertSmarterMailSession(userId, result)
    const appSession = await createAppSession(userId)
    setAppSessionCookie(c, appSession.id, appSession.expiresAt)

    return apiSuccess(c, {
      username: result.username,
      emailAddress: result.emailAddress,
      isAdmin: result.isAdmin,
      isDomainAdmin: result.isDomainAdmin,
      serverUrl: resolvedServerUrl,
      isTelegramBound: !!dbUser.telegramUserId,
    }, 'Authentication successful')
  } catch (error) {
    console.error('Login error:', error)
    const errorMessage = error instanceof Error ? error.message : 'An error occurred during authentication'
    return apiError(c, errorMessage, 500)
  }
})

// GET /api/auth/me
app.get('/auth/me', async (c) => {
  try {
    const result = await callSmarterMail(c, async ({ client, accessToken, user }) => {
      const userSettings = await client.getUserSettings(accessToken)
      const userData = userSettings?.userData
      if (!userSettings || userSettings.success === false || !userData?.emailAddress) {
        throw new HTTPException(401, { message: 'Not authenticated' })
      }
      return { userData, user }
    })

    const { userData, user } = result
    const emailAddress = userData.emailAddress!
    const username = userData.userName || emailAddress.split('@')[0]

    return apiSuccess(c, {
      username,
      emailAddress,
      serverUrl: user.serverUrl,
      isTelegramBound: !!user.telegramUserId,
    }, 'Current user retrieved successfully')
  } catch (err) {
    console.error('getUserSettings in me failed:', err)
    if (err instanceof HTTPException && err.status === 401) {
      clearAuthCookies(c)
      return apiError(c, 'Not authenticated', 401)
    }
    const errorMessage = err instanceof Error ? err.message : 'An error occurred while retrieving current user'
    return apiError(c, errorMessage, 500)
  }
})

// POST /api/auth/logout
app.post('/auth/logout', async (c) => {
  const sessionId = getCookie(c, APP_SESSION_COOKIE)
  if (sessionId) {
    await db.execute({
      sql: 'DELETE FROM app_sessions WHERE id = ?',
      args: [sessionId],
    })
  }
  clearAuthCookies(c)
  return apiSuccess(c, null, 'Successfully logged out')
})

// POST /api/auth/telegram/bind-token
app.post('/auth/telegram/bind-token', async (c) => {
  try {
    const { password } = await c.req.json()
    if (!password) {
      return apiError(c, 'Password is required to confirm and link your Telegram account', 400)
    }

    const { email, serverUrl, userId } = await callSmarterMail(c, async ({ client, accessToken, user }) => {
      const userSettings = await client.getUserSettings(accessToken)
      const userData = userSettings?.userData
      if (!userSettings || userSettings.success === false || !userData?.emailAddress) {
        throw new HTTPException(401, { message: 'Failed to fetch user email context' })
      }
      return { email: userData.emailAddress, serverUrl: user.serverUrl, userId: user.id }
    })

    const client = new SmarterMailClient(serverUrl)

    // 2. Validate password against SmarterMail
    const verifyAuth = await client.authenticateUser(email, password)
    if (!verifyAuth.success) {
      return apiError(c, 'Verification failed. Password is incorrect.', 401)
    }

    const encryptedPassword = encrypt(password)

    await db.execute({
      sql: `UPDATE users
            SET encryptedPassword = ?, serverUrl = ?, updatedAt = CURRENT_TIMESTAMP
            WHERE id = ?`,
      args: [
        encryptedPassword,
        serverUrl,
        userId,
      ],
    })
    await upsertSmarterMailSession(userId, verifyAuth)

    // 3. Store bind token (expires in 10 minutes)
    const token = nodeCrypto.randomUUID()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    await db.execute({
      sql: `INSERT INTO bind_tokens (token, userId, expiresAt)
            VALUES (?, ?, ?)`,
      args: [
        token,
        userId,
        expiresAt,
      ],
    })

    const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'CraneMailImagesBot'
    const bindUrl = `https://t.me/${botUsername}?start=${token}`

    return apiSuccess(c, { token, bindUrl }, 'Binding link generated successfully')
  } catch (error) {
    console.error('Bind token error:', error)
    if (error instanceof HTTPException) {
      return apiError(c, error.message, error.status)
    }
    const errorMessage = error instanceof Error ? error.message : 'An error occurred while generating bind token'
    return apiError(c, errorMessage, 500)
  }
})

// POST /api/upload
app.post('/upload', async (c) => {
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
        publicLink: linkResult.publicLink
      }
    })

    // 3. Save uploaded image metadata to database
    const imageId = nodeCrypto.randomUUID()
    const createdAt = new Date().toISOString()
    await db.execute({
      sql: `INSERT INTO uploaded_images (id, email, fileId, fileName, publicLink, size, source, createdAt)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        imageId,
        uploadResult.email,
        uploadResult.fileId,
        fileName,
        uploadResult.publicLink,
        file.size,
        'web',
        createdAt
      ]
    })

    return apiSuccess(c, {
      id: imageId,
      fileName,
      publicLink: uploadResult.publicLink,
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

// GET /api/images
app.get('/images', async (c) => {
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

// DELETE /api/images/:id
app.delete('/images/:id', async (c) => {
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

// POST /api/images/sync
app.post('/images/sync', async (c) => {
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

// POST /api/telegram/webhook
app.post('/telegram/webhook', async (c) => {
  try {
    const update = await c.req.json()
    // Process update asynchronously or wait
    await handleTelegramUpdate(update)
    return c.json({ ok: true })
  } catch (err) {
    console.error('Telegram webhook error:', err)
    // Always return OK 200 to Telegram to prevent retry loop
    return c.json({ ok: true })
  }
})

// Export HTTP method handlers to be consumed by Next.js App Router
export const GET = handle(app)
export const POST = handle(app)
export const PUT = handle(app)
export const DELETE = handle(app)
export const PATCH = handle(app)
export const OPTIONS = handle(app)
