import { and, eq, sql } from 'drizzle-orm'
import { db, smartermailSessions, users } from './db'
import { decrypt, encrypt } from './crypto'
import {
  SmarterMailClient,
  SmarterMailHttpError,
  SmarterMailLoginResponse,
} from './smartermail'

const ACCESS_TOKEN_REFRESH_WINDOW_MS = 2 * 60 * 1000
const refreshFlights = new Map<string, Promise<SmarterMailAuthContext>>()

export interface AppUser {
  id: string
  email: string
  serverUrl: string
  telegramUserId: string | null
  encryptedPassword: string | null
}

interface SmarterMailSessionRow {
  userId: string
  accessToken: string | null
  accessTokenExpires: string | null
  refreshToken: string | null
  refreshTokenExpires: string | null
}

export interface SmarterMailAuthContext {
  user: AppUser
  client: SmarterMailClient
  accessToken: string
}

export class SmarterMailSessionError extends Error {
  constructor(message: string, public status = 401) {
    super(message)
    this.name = 'SmarterMailSessionError'
  }
}

export function resolveServerUrl(serverUrl?: string): string {
  return (serverUrl || process.env.NEXT_PUBLIC_SMARTERMAIL_URL || 'https://us1.workspace.org').replace(/\/+$/, '')
}

export async function getUserById(userId: string): Promise<AppUser | null> {
  const [row] = await db
    .select({
      id: users.id,
      email: users.email,
      serverUrl: users.serverUrl,
      telegramUserId: users.telegramUserId,
      encryptedPassword: users.encryptedPassword,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!row || !row.email) {
    return null
  }

  return {
    id: row.id,
    email: row.email,
    serverUrl: resolveServerUrl(row.serverUrl ?? undefined),
    telegramUserId: row.telegramUserId,
    encryptedPassword: row.encryptedPassword,
  }
}

export async function upsertSmarterMailSession(userId: string, result: SmarterMailLoginResponse) {
  const encryptedAccessToken = encrypt(result.accessToken)
  const encryptedRefreshToken = encrypt(result.refreshToken)

  await db
    .insert(smartermailSessions)
    .values({
      userId,
      accessToken: encryptedAccessToken,
      accessTokenExpires: result.accessTokenExpiration,
      refreshToken: encryptedRefreshToken,
      refreshTokenExpires: result.refreshTokenExpiration,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .onConflictDoUpdate({
      target: smartermailSessions.userId,
      set: {
        accessToken: encryptedAccessToken,
        accessTokenExpires: result.accessTokenExpiration,
        refreshToken: encryptedRefreshToken,
        refreshTokenExpires: result.refreshTokenExpiration,
        updatedAt: sql`CURRENT_TIMESTAMP`,
      },
    })
}

export async function getSmarterMailAuthForUser(
  userId: string,
  options: { forceRefresh?: boolean } = {},
): Promise<SmarterMailAuthContext> {
  const existingFlight = refreshFlights.get(userId)
  if (existingFlight) {
    return existingFlight
  }

  const user = await getUserById(userId)
  if (!user) {
    throw new SmarterMailSessionError('Not authenticated')
  }

  const session = await getSessionRow(userId)
  const client = new SmarterMailClient(user.serverUrl)

  if (!options.forceRefresh && session?.accessToken && !shouldRefreshAccessToken(session.accessTokenExpires)) {
    return {
      user,
      client,
      accessToken: decryptSecret(session.accessToken, 'stored access token'),
    }
  }

  const flight = refreshOrReauthenticate(user, session)
    .finally(() => {
      refreshFlights.delete(userId)
    })

  refreshFlights.set(userId, flight)
  return flight
}

export async function callSmarterMailForUser<T>(
  userId: string,
  operation: (context: SmarterMailAuthContext) => Promise<T>,
): Promise<T> {
  let context = await getSmarterMailAuthForUser(userId)

  try {
    return await operation(context)
  } catch (err) {
    if (err instanceof SmarterMailHttpError && err.status === 401) {
      context = await getSmarterMailAuthForUser(userId, { forceRefresh: true })
      return operation(context)
    }
    throw err
  }
}

async function refreshOrReauthenticate(
  user: AppUser,
  session: SmarterMailSessionRow | null,
): Promise<SmarterMailAuthContext> {
  const client = new SmarterMailClient(user.serverUrl)

  if (session?.refreshToken) {
    try {
      const oldEncryptedRefreshToken = session.refreshToken
      const refreshToken = decryptSecret(oldEncryptedRefreshToken, 'stored refresh token')
      const refreshResult = await client.refreshToken(refreshToken)

      if (refreshResult.success && refreshResult.accessToken) {
        const nextRefreshToken = refreshResult.refreshToken || refreshToken
        const nextRefreshTokenExpires = refreshResult.refreshTokenExpiration || session.refreshTokenExpires || ''
        const saved = await saveRefreshedSession(
          user.id,
          oldEncryptedRefreshToken,
          refreshResult.accessToken,
          refreshResult.accessTokenExpiration,
          nextRefreshToken,
          nextRefreshTokenExpires,
        )

        if (!saved) {
          const latestSession = await getSessionRow(user.id)
          if (latestSession?.accessToken && !shouldRefreshAccessToken(latestSession.accessTokenExpires)) {
            return {
              user,
              client,
              accessToken: decryptSecret(latestSession.accessToken, 'stored access token'),
            }
          }
        }

        return { user, client, accessToken: refreshResult.accessToken }
      }
    } catch (err) {
      if (!(err instanceof SmarterMailHttpError) || err.status !== 401) {
        throw err
      }
    }
  }

  if (!user.encryptedPassword) {
    throw new SmarterMailSessionError('SmarterMail session expired. Please sign in again on the web page.')
  }

  const password = decryptSecret(user.encryptedPassword, 'stored password')
  const authResult = await client.authenticateUser(user.email, password)
  if (!authResult.success || !authResult.accessToken) {
    throw new SmarterMailSessionError(authResult.message || 'SmarterMail authentication failed. Please sign in again.')
  }

  await upsertSmarterMailSession(user.id, authResult)
  return { user, client, accessToken: authResult.accessToken }
}

async function getSessionRow(userId: string): Promise<SmarterMailSessionRow | null> {
  const [row] = await db
    .select({
      userId: smartermailSessions.userId,
      accessToken: smartermailSessions.accessToken,
      accessTokenExpires: smartermailSessions.accessTokenExpires,
      refreshToken: smartermailSessions.refreshToken,
      refreshTokenExpires: smartermailSessions.refreshTokenExpires,
    })
    .from(smartermailSessions)
    .where(eq(smartermailSessions.userId, userId))
    .limit(1)

  return row ?? null
}

async function saveRefreshedSession(
  userId: string,
  oldEncryptedRefreshToken: string,
  accessToken: string,
  accessTokenExpires: string,
  refreshToken: string,
  refreshTokenExpires: string,
): Promise<boolean> {
  const updated = await db
    .update(smartermailSessions)
    .set({
      accessToken: encrypt(accessToken),
      accessTokenExpires,
      refreshToken: encrypt(refreshToken),
      refreshTokenExpires,
      updatedAt: sql`CURRENT_TIMESTAMP`,
    })
    .where(
      and(
        eq(smartermailSessions.userId, userId),
        eq(smartermailSessions.refreshToken, oldEncryptedRefreshToken),
      ),
    )
    .returning({ userId: smartermailSessions.userId })

  return updated.length > 0
}

function shouldRefreshAccessToken(expiresStr?: string | null): boolean {
  if (!expiresStr) {
    return true
  }

  const expiresAt = Date.parse(expiresStr)
  if (!Number.isFinite(expiresAt)) {
    return true
  }

  return expiresAt - Date.now() <= ACCESS_TOKEN_REFRESH_WINDOW_MS
}

function decryptSecret(value: string, label: string): string {
  try {
    return decrypt(value)
  } catch {
    throw new SmarterMailSessionError(`Invalid ${label}. Please sign in again.`)
  }
}
