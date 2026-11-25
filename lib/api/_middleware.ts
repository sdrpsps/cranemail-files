import { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'
import { getAuth } from '@/lib/auth'
import { SmarterMailHttpError } from '@/lib/smartermail'
import {
  callSmarterMailForUser,
  resolveServerUrl,
  SmarterMailSessionError,
} from '@/lib/smartermail-session'
import type { AppUser, SmarterMailAuthContext } from '@/lib/smartermail-session'

type CurrentUser = Pick<AppUser, 'id' | 'email' | 'serverUrl'>

export function forwardAuthCookies(c: Context, headers: Headers) {
  for (const cookie of headers.getSetCookie()) {
    c.header('Set-Cookie', cookie, { append: true })
  }
}

export async function getCurrentUser(c: Context): Promise<CurrentUser | null> {
  const { response, headers } = await getAuth().api.getSession({
    headers: c.req.raw.headers,
    returnHeaders: true,
  })
  forwardAuthCookies(c, headers)

  const user = response?.user
  if (!user?.email) {
    return null
  }

  return {
    id: user.id,
    email: user.email,
    serverUrl: resolveServerUrl(user.serverUrl ?? undefined),
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
