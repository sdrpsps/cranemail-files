import { eq, sql } from 'drizzle-orm'
import { Hono } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { getCookie } from 'hono/cookie'
import { apiSuccess, apiError } from '@/lib/response'
import { SmarterMailClient } from '@/lib/smartermail'
import { encrypt } from '@/lib/crypto'
import { appSessions, bindTokens, db, users } from '@/lib/db'
import {
  resolveServerUrl,
  upsertSmarterMailSession,
} from '@/lib/smartermail-session'
import nodeCrypto from 'crypto'
import {
  APP_SESSION_COOKIE,
  callSmarterMail,
  clearAuthCookies,
  createAppSession,
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
        telegramUserId: users.telegramUserId,
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
      isTelegramBound: !!dbUser.telegramUserId,
    }, 'Authentication successful')
  } catch (error) {
    console.error('Login error:', error)
    const errorMessage = error instanceof Error ? error.message : 'An error occurred during authentication'
    return apiError(c, errorMessage, 500)
  }
})

// GET /me
authApp.get('/me', async (c) => {
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
      expiresAt,
    })

    const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'CraneMailFilesBot'
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
