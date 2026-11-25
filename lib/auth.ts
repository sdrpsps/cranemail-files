import type { BetterAuthPlugin } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { APIError, createAuthEndpoint, formCsrfMiddleware } from 'better-auth/api'
import { setSessionCookie } from 'better-auth/cookies'
import { betterAuth } from 'better-auth/minimal'
import { sql } from 'drizzle-orm'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { isUserTelegramBound } from './bot/users'
import { encrypt } from './crypto'
import { authAccounts, authSessions, authVerifications, getDb, users } from './db'
import { getSiteUrl } from './site'
import { SmarterMailClient, SmarterMailHttpError } from './smartermail'
import { resolveServerUrl, upsertSmarterMailSession } from './smartermail-session'

const smarterMailLogin = {
  id: 'smartermail-login',
  endpoints: {
    smarterMailSignIn: createAuthEndpoint('/login', {
      method: 'POST',
      use: [formCsrfMiddleware],
      body: z.object({
        username: z.string().min(1, 'Username is required'),
        password: z.string().min(1, 'Password is required'),
        serverUrl: z.string().optional(),
      }),
      metadata: { allowedMediaTypes: ['application/json'] },
    }, async (ctx) => {
      const { username, password, serverUrl } = ctx.body
      const resolvedServerUrl = resolveServerUrl(serverUrl)
      const client = new SmarterMailClient(resolvedServerUrl)
      const result = await client.authenticateUser(username, password).catch((error: unknown) => {
        if (error instanceof SmarterMailHttpError && (error.status === 401 || error.status === 403)) {
          throw new APIError('UNAUTHORIZED', { message: 'Authentication failed' })
        }
        throw error
      })

      if (!result.success) {
        throw new APIError('UNAUTHORIZED', { message: result.message || 'Authentication failed' })
      }
      if (!result.emailAddress || !result.accessToken) {
        throw new APIError('BAD_GATEWAY', { message: 'SmarterMail returned an incomplete login response' })
      }

      const email = result.emailAddress
      const profile = {
        name: result.username || email.split('@')[0],
        serverUrl: resolvedServerUrl,
        encryptedPassword: encrypt(password),
        updatedAt: sql`CURRENT_TIMESTAMP`,
      }
      const [user] = await getDb().insert(users)
        .values({ id: randomUUID(), email, ...profile })
        .onConflictDoUpdate({ target: users.email, set: profile })
        .returning({
          id: users.id,
          name: users.name,
          emailVerified: users.emailVerified,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        })
      if (!user) {
        throw new Error('Failed to persist user record')
      }

      await upsertSmarterMailSession(user.id, result)
      const isTelegramBound = await isUserTelegramBound(user.id)
      const session = await ctx.context.internalAdapter.createSession(user.id)
      if (!session) {
        throw new Error('Failed to create app session')
      }

      await setSessionCookie(ctx, {
        session,
        user: {
          ...user,
          email,
          createdAt: user.createdAt ?? new Date(),
          updatedAt: user.updatedAt ?? new Date(),
        },
      }, false)

      return ctx.json({
        username: result.username,
        emailAddress: email,
        isAdmin: result.isAdmin,
        isDomainAdmin: result.isDomainAdmin,
        serverUrl: resolvedServerUrl,
        isTelegramBound,
      })
    }),
  },
} satisfies BetterAuthPlugin

export function getAuth() {
  return betterAuth({
    baseURL: process.env.BETTER_AUTH_URL?.trim() || getSiteUrl().origin,
    basePath: '/api/auth',
    secret: process.env.BETTER_AUTH_SECRET,
    telemetry: { enabled: false },
    database: drizzleAdapter(getDb(), {
      provider: 'sqlite',
      schema: {
        user: users,
        session: authSessions,
        account: authAccounts,
        verification: authVerifications,
      },
    }),
    session: {
      expiresIn: 30 * 24 * 60 * 60,
      disableSessionRefresh: true,
    },
    user: {
      additionalFields: {
        serverUrl: { type: 'string', required: false, input: false },
      },
    },
    plugins: [smarterMailLogin],
  })
}
