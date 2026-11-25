import { eq, sql } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { getAuth } from '@/lib/auth'
import { apiSuccess, apiError } from '@/lib/response'
import { SmarterMailClient } from '@/lib/smartermail'
import { encrypt } from '@/lib/crypto'
import { findBotRuntime, hasBotAccess } from '@/lib/bot/config'
import { isUserTelegramBound } from '@/lib/bot/users'
import { bindTokens, getDb, users } from '@/lib/db'
import { upsertSmarterMailSession } from '@/lib/smartermail-session'
import nodeCrypto from 'crypto'
import {
  forwardAuthCookies,
  getCurrentUser,
  requireCurrentUser,
} from '../_middleware'

const authApp = new Hono()

async function appAuthResponse(c: Context, request: Request, message: string, includeData: boolean) {
  const response = await getAuth().handler(request)
  c.header('Cache-Control', 'no-store')
  forwardAuthCookies(c, response.headers)
  const retryAfter = response.headers.get('Retry-After')
  if (retryAfter) c.header('Retry-After', retryAfter)

  if (!response.ok) {
    const error = await response.json().catch(() => null)
    return apiError(c, error?.message || 'Authentication request failed', response.status)
  }

  return apiSuccess(c, includeData ? await response.json() : null, message)
}

authApp.post('/login', (c) =>
  appAuthResponse(c, c.req.raw, 'Authentication successful', true))

// GET /me
authApp.get('/me', async (c) => {
  c.header('Cache-Control', 'no-store')
  try {
    const user = await getCurrentUser(c)
    if (!user) {
      return apiError(c, 'Not authenticated', 401)
    }

    return apiSuccess(c, {
      username: user.email.split('@')[0],
      emailAddress: user.email,
      serverUrl: user.serverUrl,
      isTelegramBound: await isUserTelegramBound(user.id),
    }, 'Current user retrieved successfully')
  } catch (err) {
    console.error('Current user lookup failed:', err)
    const errorMessage = err instanceof Error ? err.message : 'An error occurred while retrieving current user'
    return apiError(c, errorMessage, 500)
  }
})

authApp.post('/logout', (c) => {
  const url = new URL('/api/auth/sign-out', c.req.url)
  return appAuthResponse(c, new Request(url, c.req.raw), 'Successfully logged out', false)
})

// POST /telegram/bind-token
authApp.post('/telegram/bind-token', async (c) => {
  try {
    const { password, botId } = await c.req.json()
    if (!password) {
      return apiError(c, 'Password is required to confirm and link your Telegram account', 400)
    }

    const { id: userId, email, serverUrl } = await requireCurrentUser(c)

    if (typeof botId !== 'string' || !await hasBotAccess(botId, userId)) {
      return apiError(c, 'Select a bot configured for this account.', 403)
    }
    const runtime = await findBotRuntime(botId)
    if (!runtime) return apiError(c, 'Bot is not configured.', 400)

    const client = new SmarterMailClient(serverUrl)

    // 2. Validate password against SmarterMail
    const verifyAuth = await client.authenticateUser(email, password)
    if (!verifyAuth.success) {
      return apiError(c, 'Verification failed. Password is incorrect.', 401)
    }

    const encryptedPassword = encrypt(password)

    const db = getDb()
    await db
      .update(users)
      .set({
        encryptedPassword,
        serverUrl,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .where(eq(users.id, userId))
    await upsertSmarterMailSession(userId, verifyAuth)

    // 3. Store bind token (expires in 10 minutes)
    const token = nodeCrypto.randomUUID()
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()

    await db.insert(bindTokens).values({
      token,
      userId,
      botId,
      expiresAt,
    })

    const botUsername = runtime.info?.username
    if (!botUsername) throw new Error('Bot username is not available.')
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

export default authApp
