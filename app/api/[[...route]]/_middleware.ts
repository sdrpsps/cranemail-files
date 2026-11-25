import { and, eq, gt, sql } from 'drizzle-orm'
import { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { appSessions, db, users } from '@/lib/db'
import {
  AppUser,
  callSmarterMailForUser,
  resolveServerUrl,
  SmarterMailAuthContext,
  SmarterMailSessionError,
} from '@/lib/smartermail-session'
import nodeCrypto from 'crypto'

// --- Cookie Configuration ---

const isProd = process.env.NODE_ENV === 'production'

export const APP_SESSION_COOKIE = 'app_session_id'
export const APP_SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000

export const getCookieOptions = (expiresStr?: string) => ({
  path: '/',
  httpOnly: true,
  secure: isProd,
  sameSite: 'Lax' as const,
  ...(expiresStr ? { expires: new Date(expiresStr) } : {}),
})

// --- Session Helpers ---

export function clearAuthCookies(c: Context) {
  deleteCookie(c, APP_SESSION_COOKIE, { path: '/' })
}

export function setAppSessionCookie(c: Context, sessionId: string, expiresAt: string) {
  setCookie(c, APP_SESSION_COOKIE, sessionId, getCookieOptions(expiresAt))
}

export async function createAppSession(userId: string): Promise<{ id: string; expiresAt: string }> {
  const id = nodeCrypto.randomUUID()
  const expiresAt = new Date(Date.now() + APP_SESSION_DURATION_MS).toISOString()

  await db.insert(appSessions).values({
    id,
    userId,
    expiresAt,
    updatedAt: sql`CURRENT_TIMESTAMP`,
  })

  return { id, expiresAt }
}

// --- User Resolution ---

export async function getCurrentUser(c: Context): Promise<AppUser | null> {
  const sessionId = getCookie(c, APP_SESSION_COOKIE)
  if (!sessionId) {
    return null
  }

  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      serverUrl: users.serverUrl,
      encryptedPassword: users.encryptedPassword,
    })
    .from(appSessions)
    .innerJoin(users, eq(users.id, appSessions.userId))
    .where(
      and(
        eq(appSessions.id, sessionId),
        gt(appSessions.expiresAt, new Date().toISOString()),
      ),
    )
    .limit(1)

  if (!row || !row.email) {
    clearAuthCookies(c)
    return null
  }

  return {
    id: row.id,
    email: row.email,
    serverUrl: resolveServerUrl(row.serverUrl ?? undefined),
    encryptedPassword: row.encryptedPassword,
  }
}

export async function requireCurrentUser(c: Context): Promise<AppUser> {
  const user = await getCurrentUser(c)
  if (!user) {
    throw new HTTPException(401, { message: 'Not authenticated' })
  }

  return user
}

// --- SmarterMail Call Wrapper ---

export async function callSmarterMail<T>(
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
