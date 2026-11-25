import { readMigrationFiles } from 'drizzle-orm/migrator'
import { getPlatformProxy } from 'wrangler'
import { createD1Database, type CraneMailD1Database } from '../lib/db/d1'
import * as schema from '../lib/db/schema'
import journal from '../drizzle/meta/_journal.json'

export async function createTestDatabase() {
  const platform = await getPlatformProxy<{ DB: CraneMailD1Database['$client'] }>({
    configPath: 'wrangler.jsonc',
    persist: false,
    envFiles: [],
    remoteBindings: false,
  })
  const contextKey = Symbol.for('__cloudflare-context__')
  Reflect.set(globalThis, contextKey, platform)
  const { DB: binding } = platform.env
  const db = createD1Database(binding)
  const migrations = readMigrationFiles({ migrationsFolder: './drizzle' })
  const history = 'CREATE TABLE IF NOT EXISTS d1_migrations (name TEXT PRIMARY KEY NOT NULL)'

  async function migrate(limit = migrations.length) {
    await binding.prepare(history).run()
    const { results }: { results: { name: string }[] } = await binding.prepare('SELECT name FROM d1_migrations').all()
    const applied = new Set(results.map(({ name }) => name))
    for (const [index, migration] of migrations.slice(0, limit).entries()) {
      const name = `${journal.entries[index].tag}.sql`
      if (applied.has(name)) continue
      await binding.batch([
        ...migration.sql.filter((statement) => statement.trim()).map((statement) => binding.prepare(statement)),
        binding.prepare('INSERT INTO d1_migrations (name) VALUES (?)').bind(name),
      ])
    }
  }

  async function dispose() {
    Reflect.deleteProperty(globalThis, contextKey)
    await platform.dispose()
  }

  return { ...schema, db, binding, migrate, dispose }
}
