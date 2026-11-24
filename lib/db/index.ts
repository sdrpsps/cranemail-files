import { createClient, type Client } from '@libsql/client'
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql'
import path from 'path'
import * as schema from './schema'
import migrationJournal from '../../drizzle/meta/_journal.json'

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

/** Check readiness once per process. Schema changes run explicitly before deployment. */
export async function initDb() {
  try {
    const history = await client.execute('SELECT MAX(created_at) AS latest FROM __drizzle_migrations')
    const required = migrationJournal.entries[migrationJournal.entries.length - 1].when
    if (Number(history.rows[0]?.latest ?? 0) < required) {
      throw new Error('Database migrations are behind this application version.')
    }
    // Selecting every mapped column also catches accidental schema drift without reading data.
    await db.select().from(schema.users).limit(0)
    await db.select().from(schema.appSessions).limit(0)
    await db.select().from(schema.smartermailSessions).limit(0)
    await db.select().from(schema.bindTokens).limit(0)
    await db.select().from(schema.uploadedFiles).limit(0)
  } catch (cause) {
    throw new Error(
      'Database is not ready. Run pnpm db:migrate before deployment.',
      { cause },
    )
  }
}

export * from './schema'
