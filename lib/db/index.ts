import { getCloudflareContext } from '@opennextjs/cloudflare'
import { checkD1Migrations, createD1Database, type CraneMailD1Database } from './d1'

const connections = new WeakMap<object, CraneMailD1Database>()
const ready = new WeakSet<object>()

export function getDb(): CraneMailD1Database {
  const { env } = getCloudflareContext()
  const binding = (env as typeof env & { DB?: CraneMailD1Database['$client'] }).DB
  if (!binding) throw new Error('The D1 DB binding is required.')
  let db = connections.get(binding)
  if (!db) {
    db = createD1Database(binding)
    connections.set(binding, db)
  }
  return db
}

export async function ensureDbInitialized() {
  const db = getDb()
  if (ready.has(db)) return
  await checkD1Migrations(db)
  ready.add(db)
}

export * from './schema'
