import { createClient } from '@libsql/client'
import path from 'path'

// In local development, fall back to a local SQLite file: local.db in the project root
const isLocal = !process.env.TURSO_DATABASE_URL
const url = process.env.TURSO_DATABASE_URL || `file:${path.resolve(process.cwd(), 'local.db')}`
const authToken = process.env.TURSO_AUTH_TOKEN

console.log(`[Database] Connecting to: ${isLocal ? 'Local SQLite file (local.db)' : 'Turso Cloud Database'}`)

export const db = createClient({
  url,
  ...(authToken ? { authToken } : {}),
})

let initDbPromise: Promise<void> | null = null

export function ensureDbInitialized(): Promise<void> {
  if (!initDbPromise) {
    initDbPromise = initDb().catch((err) => {
      initDbPromise = null
      throw err
    })
  }

  return initDbPromise
}

/**
 * Automatically initializes database schema tables if they do not exist.
 * This is called on API initialization so local and remote databases auto-provision.
 */
export async function initDb() {
  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE,
        serverUrl TEXT,
        telegramUserId TEXT UNIQUE,
        encryptedPassword TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `)

    await db.execute(`
      CREATE TABLE IF NOT EXISTS bind_tokens (
        token TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        expiresAt TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `)

    await db.execute(`
      CREATE TABLE IF NOT EXISTS app_sessions (
        id TEXT PRIMARY KEY,
        userId TEXT NOT NULL,
        expiresAt TEXT NOT NULL,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `)

    await db.execute(`
      CREATE TABLE IF NOT EXISTS smartermail_sessions (
        userId TEXT PRIMARY KEY,
        accessToken TEXT,
        accessTokenExpires TEXT,
        refreshToken TEXT,
        refreshTokenExpires TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP,
        updatedAt TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `)

    await db.execute(`
      CREATE TABLE IF NOT EXISTS uploaded_files (
        id TEXT PRIMARY KEY,
        email TEXT,
        fileId TEXT,
        fileName TEXT,
        publicLink TEXT,
        size INTEGER,
        source TEXT,
        createdAt TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `)


    console.log('[Database] Tables checked/created successfully.')
  } catch (err) {
    console.error('[Database] Failed to initialize tables:', err)
    throw err
  }
}
