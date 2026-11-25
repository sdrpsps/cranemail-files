import { eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { getCookie } from 'hono/cookie'
import { apiSuccess, apiError } from '@/lib/response'
import { SmarterMailClient } from '@/lib/smartermail'
import { encrypt } from '@/lib/crypto'
import { findBotRuntime, hasBotAccess } from '@/lib/bot/config'
import { isUserTelegramBound } from '@/lib/bot/users'
import { appSessions, bindTokens, db, users } from '@/lib/db'
import {
  resolveServerUrl,
  upsertSmarterMailSession,
} from '@/lib/smartermail-session'
import nodeCrypto from 'crypto'
import {
  APP_SESSION_COOKIE,
  clearAuthCookies,
  createAppSession,
  getCurrentUser,
  requireCurrentUser,
  setAppSessionCookie,
} from '../_middleware'

const authApp = new Hono()

// POST /login
authApp.post('/login', async (c) => {
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

    const [dbUser] = await db
      .insert(users)
      .values({
        id: newUserId,
        email: result.emailAddress,
        serverUrl: resolvedServerUrl,
        encryptedPassword,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      })
      .onConflictDoUpdate({
        target: users.email,
        set: {
          serverUrl: resolvedServerUrl,
          encryptedPassword,
          updatedAt: sql`CURRENT_TIMESTAMP`,
        },
      })
      .returning({
        id: users.id,
      })

    if (!dbUser) {
      throw new Error('Failed to persist user record')
    }
    const userId = dbUser.id

    await upsertSmarterMailSession(userId, result)
    const appSession = await createAppSession(userId)
    setAppSessionCookie(c, appSession.id, appSession.expiresAt)

    return apiSuccess(c, {
      username: result.username,
      emailAddress: result.emailAddress,
      isAdmin: result.isAdmin,
      isDomainAdmin: result.isDomainAdmin,
      serverUrl: resolvedServerUrl,
      isTelegramBound: await isUserTelegramBound(userId),
    }, 'Authentication successful')
  } catch (error) {
    console.error('Login error:', error)
    const errorMessage = error instanceof Error ? error.message : 'An error occurred during authentication'
    return apiError(c, errorMessage, 500)
  }
})

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

// POST /logout
authApp.post('/logout', async (c) => {
  const sessionId = getCookie(c, APP_SESSION_COOKIE)
  if (sessionId) {
    await db.delete(appSessions).where(eq(appSessions.id, sessionId))
  }
  clearAuthCookies(c)
  return apiSuccess(c, null, 'Successfully logged out')
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
