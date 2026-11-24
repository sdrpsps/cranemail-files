import { createClient, type Client } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import path from 'path'
import * as schema from './schema'

// In local development, fall back to a local SQLite file: local.db in the project root
const tursoUrl = process.env.TURSO_DATABASE_URL?.trim()
const isLocal = !tursoUrl || tursoUrl.startsWith('file:')
const url = tursoUrl || `file:${path.resolve(process.cwd(), 'local.db')}`
const authToken = isLocal ? undefined : process.env.TURSO_AUTH_TOKEN?.trim() || undefined

const globalForDb = globalThis as unknown as {
  __cranemailLibsqlClient?: Client
  __cranemailDrizzleDb?: LibSQLDatabase<typeof schema>
  __cranemailInitDbPromise?: Promise<void> | null
}

export const client =
  globalForDb.__cranemailLibsqlClient ??
  createClient({
    url,
    ...(authToken ? { authToken } : {}),
  })

if (!globalForDb.__cranemailLibsqlClient) {
  console.log(`[Database] Connecting to: ${isLocal ? `Local SQLite (${url})` : 'Turso Cloud Database'}`)
}

export const db = globalForDb.__cranemailDrizzleDb ?? drizzle(client, { schema })

if (process.env.NODE_ENV !== 'production') {
  globalForDb.__cranemailLibsqlClient = client
  globalForDb.__cranemailDrizzleDb = db
}

export function ensureDbInitialized(): Promise<void> {
  if (!globalForDb.__cranemailInitDbPromise) {
    globalForDb.__cranemailInitDbPromise = initDb().catch((err) => {
      globalForDb.__cranemailInitDbPromise = null
      throw err
    })
  }

  return globalForDb.__cranemailInitDbPromise
}

/**
 * Automatically initializes database schema tables if they do not exist.
 * This is called on API initialization so local and remote databases auto-provision.
 */
export async function initDb() {
  try {
    await client.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY NOT NULL,
        email TEXT,
        serverUrl TEXT,
        telegramUserId TEXT,
        encryptedPassword TEXT,
        createdAt TEXT DEFAULT (CURRENT_TIMESTAMP),
        updatedAt TEXT DEFAULT (CURRENT_TIMESTAMP)
      );
    `)

    await client.execute(
      `CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique ON users (email);`,
    )

    await client.execute(
      `CREATE UNIQUE INDEX IF NOT EXISTS users_telegramUserId_unique ON users (telegramUserId);`,
    )

    await client.execute(`
      CREATE TABLE IF NOT EXISTS bind_tokens (
        token TEXT PRIMARY KEY NOT NULL,
        userId TEXT NOT NULL,
        expiresAt TEXT,
        createdAt TEXT DEFAULT (CURRENT_TIMESTAMP)
      );
    `)

    await client.execute(`
      CREATE TABLE IF NOT EXISTS app_sessions (
        id TEXT PRIMARY KEY NOT NULL,
        userId TEXT NOT NULL,
        expiresAt TEXT NOT NULL,
        createdAt TEXT DEFAULT (CURRENT_TIMESTAMP),
        updatedAt TEXT DEFAULT (CURRENT_TIMESTAMP)
      );
    `)

    await client.execute(`
      CREATE TABLE IF NOT EXISTS smartermail_sessions (
        userId TEXT PRIMARY KEY NOT NULL,
        accessToken TEXT,
        accessTokenExpires TEXT,
        refreshToken TEXT,
        refreshTokenExpires TEXT,
        createdAt TEXT DEFAULT (CURRENT_TIMESTAMP),
        updatedAt TEXT DEFAULT (CURRENT_TIMESTAMP)
      );
    `)

    await client.execute(`
      CREATE TABLE IF NOT EXISTS uploaded_files (
        id TEXT PRIMARY KEY NOT NULL,
        email TEXT,
        fileId TEXT,
        fileName TEXT,
        publicLink TEXT,
        size INTEGER,
        source TEXT,
        createdAt TEXT DEFAULT (CURRENT_TIMESTAMP)
      );
    `)

    console.log('[Database] Tables checked/created successfully.')
  } catch (err) {
    console.error('[Database] Failed to initialize tables:', err)
    throw err
  }
}

export * from './schema'
