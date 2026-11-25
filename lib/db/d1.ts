import { sql } from 'drizzle-orm'
import { drizzle, type AnyD1Database } from 'drizzle-orm/d1'
import migrationJournal from '../../drizzle/meta/_journal.json'
import * as schema from './schema'

export function createD1Database(binding: AnyD1Database) {
  return drizzle(binding, { schema })
}

export type CraneMailD1Database = ReturnType<typeof createD1Database>

export async function checkD1Migrations(db: CraneMailD1Database) {
  try {
    const rows = await db.all<{ name: string }>(sql`SELECT name FROM d1_migrations`)
    const applied = new Set(rows.map(({ name }) => name))
    const missing = migrationJournal.entries
      .map(({ tag }) => `${tag}.sql`)
      .filter((name) => !applied.has(name))
    if (missing.length) throw new Error(`Missing migrations: ${missing.join(', ')}`)
  } catch (cause) {
    throw new Error('D1 is not ready. Apply the migrations for this database before serving traffic.', { cause })
  }
}
