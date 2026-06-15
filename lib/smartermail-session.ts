import { db } from './db'
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
  const result = await db.execute({
    sql: 'SELECT id, email, serverUrl, telegramUserId, encryptedPassword FROM users WHERE id = ? LIMIT 1',
    args: [userId],
  })

  return (result.rows[0] as unknown as AppUser | undefined) || null
}

export async function upsertSmarterMailSession(userId: string, result: SmarterMailLoginResponse) {
  await db.execute({
    sql: `INSERT INTO smartermail_sessions (
            userId,
            accessToken,
            accessTokenExpires,
            refreshToken,
            refreshTokenExpires,
            updatedAt
          )
          VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
          ON CONFLICT(userId) DO UPDATE SET
            accessToken = excluded.accessToken,
            accessTokenExpires = excluded.accessTokenExpires,
            refreshToken = excluded.refreshToken,
            refreshTokenExpires = excluded.refreshTokenExpires,
            updatedAt = CURRENT_TIMESTAMP`,
    args: [
      userId,
      encrypt(result.accessToken),
      result.accessTokenExpiration,
      encrypt(result.refreshToken),
      result.refreshTokenExpiration,
    ],
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
  const result = await db.execute({
    sql: 'SELECT * FROM smartermail_sessions WHERE userId = ? LIMIT 1',
    args: [userId],
  })

  return (result.rows[0] as unknown as SmarterMailSessionRow | undefined) || null
}

async function saveRefreshedSession(
  userId: string,
  oldEncryptedRefreshToken: string,
  accessToken: string,
  accessTokenExpires: string,
  refreshToken: string,
  refreshTokenExpires: string,
): Promise<boolean> {
  const result = await db.execute({
    sql: `UPDATE smartermail_sessions
          SET accessToken = ?,
              accessTokenExpires = ?,
              refreshToken = ?,
              refreshTokenExpires = ?,
              updatedAt = CURRENT_TIMESTAMP
          WHERE userId = ? AND refreshToken = ?`,
    args: [
      encrypt(accessToken),
      accessTokenExpires,
      encrypt(refreshToken),
      refreshTokenExpires,
      userId,
      oldEncryptedRefreshToken,
    ],
  })

  return result.rowsAffected > 0
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
