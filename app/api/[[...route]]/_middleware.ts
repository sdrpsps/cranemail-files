import { and, eq, gt, sql } from 'drizzle-orm'
import { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { getCookie, setCookie, deleteCookie } from 'hono/cookie'
import { appSessions, db, users } from '@/lib/db'
import { SmarterMailHttpError } from '@/lib/smartermail'
import {
  callSmarterMailForUser,
  resolveServerUrl,
  SmarterMailSessionError,
} from '@/lib/smartermail-session'
import type { AppUser, SmarterMailAuthContext } from '@/lib/smartermail-session'
import nodeCrypto from 'crypto'

type CurrentUser = Pick<AppUser, 'id' | 'email' | 'serverUrl'>

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

export async function getCurrentUser(c: Context): Promise<CurrentUser | null> {
  const sessionId = getCookie(c, APP_SESSION_COOKIE)
  if (!sessionId) {
    return null
  }

  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      serverUrl: users.serverUrl,
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
  }
}

export async function requireCurrentUser(c: Context): Promise<CurrentUser> {
  const user = await getCurrentUser(c)
  if (!user) {
    throw new HTTPException(401, { message: 'Not authenticated' })
  }

  return user
}

// --- SmarterMail Call Wrapper ---

export async function callSmarterMail<T>(
  userId: string,
  operation: (context: SmarterMailAuthContext) => Promise<T>,
): Promise<T> {
  try {
    return await callSmarterMailForUser(userId, operation)
  } catch (err) {
    if (err instanceof SmarterMailSessionError) {
      throw new HTTPException(502, { message: err.message, cause: err })
    }
    if (err instanceof SmarterMailHttpError && (err.status === 401 || err.status === 403 || err.status >= 500)) {
      throw new HTTPException(502, { message: 'SmarterMail could not authorize or complete the file operation.', cause: err })
    }
    throw err
  }
}
