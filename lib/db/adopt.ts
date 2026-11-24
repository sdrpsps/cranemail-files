import { createClient, type Client, type InStatement } from '@libsql/client'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { generateShortCode, withShortCodeRetry } from '../shortlink-code'

// This bridge is deliberately pinned to the migrations present before adoption.
// Future migrations must run normally, rather than being marked as applied.
const BASELINE_TAGS = ['0000_safe_dragon_man', '0001_lean_iron_patriot']
const TABLES = ['users', 'app_sessions', 'smartermail_sessions', 'bind_tokens', 'uploaded_files']

function identifier(value: string) {
  return `"${value.replaceAll('"', '""')}"`
}

async function describeTable(client: Client, name: string) {
  const columns = await client.execute(`PRAGMA table_xinfo(${identifier(name)})`)
  const indexes = await client.execute(`PRAGMA index_list(${identifier(name)})`)
  const uniqueColumns: string[][] = []
  for (const index of indexes.rows) {
    if (index.origin === 'pk') continue
    const info = await client.execute(`PRAGMA index_info(${identifier(String(index.name))})`)
    if (index.unique !== 1 || index.partial !== 0 || info.rows.some((row) => row.name === null)) {
      throw new Error(`Unsupported index on ${name}: ${index.name}. Review custom schema before adoption.`)
    }
    const details = await client.execute(`PRAGMA index_xinfo(${identifier(String(index.name))})`)
    if (details.rows.some((row) => row.key === 1 && (row.desc !== 0 || row.coll !== 'BINARY'))) {
      throw new Error(`Unsupported index ordering or collation on ${name}: ${index.name}.`)
    }
    uniqueColumns.push(info.rows.map((row) => String(row.name)))
  }
  return { columns: columns.rows, uniqueColumns }
}

function normalizeDefault(value: unknown) {
  return value == null ? null : String(value).replace(/[()\s]/g, '').toUpperCase()
}

/**
 * Resumable data backfill, separate from the atomic schema/ledger transaction.
 * A remote database receives one write batch per 100 records.
 */
async function backfillShortCodes(client: Client) {
  let updated = 0
  for (;;) {
    const pending = await client.execute('SELECT id FROM uploaded_files WHERE shortCode IS NULL LIMIT 100')
    if (pending.rows.length === 0) return updated
    const { result } = await withShortCodeRetry((firstCode) => {
      const used = new Set<string>()
      const statements = pending.rows.map((row, index) => {
        let code = index === 0 ? firstCode : generateShortCode()
        while (used.has(code)) code = generateShortCode()
        used.add(code)
        return {
          sql: 'UPDATE uploaded_files SET shortCode = ? WHERE id = ? AND shortCode IS NULL',
          args: [code, row.id],
        }
      })
      return client.batch(statements, 'write')
    })
    updated += result.reduce((sum, statement) => sum + statement.rowsAffected, 0)
  }
}

export async function adoptDatabase(
  client: Client,
  { checkOnly = false, migrationsFolder = path.resolve('drizzle') } = {},
) {
  const journal = JSON.parse(readFileSync(path.join(migrationsFolder, 'meta/_journal.json'), 'utf8'))
  if (BASELINE_TAGS.some((tag, index) => journal.entries[index]?.tag !== tag)) {
    throw new Error('The adoption baseline does not match the migration journal.')
  }
  const migrations = readMigrationFiles({ migrationsFolder })
  const objects = await client.execute("SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE name NOT LIKE 'sqlite_%'")
  const ledgerExists = objects.rows.some((row) => row.type === 'table' && row.name === '__drizzle_migrations')
  if (ledgerExists) {
    const history = await client.execute('SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at')
    if (history.rows.length > 0) {
      if (history.rows.length < BASELINE_TAGS.length
        || history.rows.some((row, index) => row.hash !== migrations[index]?.hash
          || Number(row.created_at) !== migrations[index]?.folderMillis)) {
        throw new Error('Existing migration history is partial or differs from this checkout. Use the matching migrations; do not re-baseline.')
      }
      const pending = await client.execute('SELECT COUNT(*) AS count FROM uploaded_files WHERE shortCode IS NULL')
      return {
        alreadyManaged: true,
        pendingShortCodes: Number(pending.rows[0].count),
        backfilled: checkOnly ? 0 : await backfillShortCodes(client),
        tables: [] as { name: string; rows: number }[],
      }
    }
  }

  // Reject custom dependencies rather than silently deleting or changing them.
  for (const object of objects.rows) {
    if (object.type === 'view' || (object.type === 'trigger' && TABLES.includes(String(object.tbl_name)))) {
      throw new Error(`Custom ${object.type} ${object.name} requires manual review before adoption.`)
    }
    if (object.type === 'table') {
      const foreignKeys = await client.execute(`PRAGMA foreign_key_list(${identifier(String(object.name))})`)
      if (foreignKeys.rows.some((row) => TABLES.includes(String(object.name)) || TABLES.includes(String(row.table)))) {
        throw new Error(`Foreign keys involving ${object.name} require manual review before adoption.`)
      }
    }
  }

  const reference = createClient({ url: 'file::memory:' })
  try {
    const baseline = migrations.slice(0, BASELINE_TAGS.length)
    await reference.batch(baseline.flatMap((migration) => migration.sql).filter((sql) => sql.trim()), 'write')
    const statements: InStatement[] = []
    const tables: { name: string; rows: number }[] = []
    let hasShortCodes = false
    for (const name of TABLES) {
      const existing = objects.rows.find((row) => row.type === 'table' && row.name === name)
      if (!existing) throw new Error(`Missing legacy table ${name}. For an empty database, use db:migrate.`)
      if (/\b(CHECK|REFERENCES|COLLATE|GENERATED|STRICT|AUTOINCREMENT|CONSTRAINT)\b|\bWITHOUT\s+ROWID\b/i.test(String(existing.sql))) {
        throw new Error(`Custom constraints on ${name} require manual review before adoption.`)
      }
      const actual = await describeTable(client, name)
      const expected = await describeTable(reference, name)
      if (name === 'uploaded_files') hasShortCodes = actual.columns.some((column) => column.name === 'shortCode')
      for (const column of actual.columns) {
        const target = expected.columns.find((item) => item.name === column.name)
        if (!target || column.hidden !== 0
          || String(column.type).toUpperCase() !== target.type
          || column.pk !== target.pk
          || (column.notnull !== target.notnull && !(column.pk === 1 && column.notnull === 0))
          || normalizeDefault(column.dflt_value) !== normalizeDefault(target.dflt_value)) {
          throw new Error(`Unexpected column definition: ${name}.${column.name}. Review schema drift before adoption.`)
        }
      }
      for (const column of expected.columns) {
        const present = actual.columns.some((item) => item.name === column.name)
        if (!present && !(name === 'uploaded_files' && column.name === 'shortCode')) {
          throw new Error(`Missing legacy column: ${name}.${column.name}.`)
        }
        if (present && column.notnull === 1) {
          const invalid = await client.execute(`SELECT 1 FROM ${identifier(name)} WHERE ${identifier(String(column.name))} IS NULL LIMIT 1`)
          if (invalid.rows.length) throw new Error(`NULL values in ${name}.${column.name}; fix them before adoption.`)
        }
      }
      const expectedKeys = expected.uniqueColumns.map((columns) => JSON.stringify(columns))
      if (actual.uniqueColumns.some((columns) => !expectedKeys.includes(JSON.stringify(columns)))) {
        throw new Error(`Unexpected unique constraint on ${name}. Review schema drift before adoption.`)
      }
      for (const columns of expected.uniqueColumns) {
        if (!columns.every((column) => actual.columns.some((item) => item.name === column))) continue
        const keys = columns.map(identifier).join(', ')
        const duplicates = await client.execute(`SELECT 1 FROM ${identifier(name)}
          WHERE ${columns.map((column) => `${identifier(column)} IS NOT NULL`).join(' AND ')}
          GROUP BY ${keys} HAVING COUNT(*) > 1 LIMIT 1`)
        if (duplicates.rows.length) throw new Error(`Duplicate values in ${name} (${columns.join(', ')}); fix them before adoption.`)
      }

      const count = await client.execute(`SELECT COUNT(*) AS count FROM ${identifier(name)}`)
      tables.push({ name, rows: Number(count.rows[0].count) })
      const temporaryName = `__adopt_${name}`
      if (objects.rows.some((row) => row.name === temporaryName)) {
        throw new Error(`Reserved adoption table already exists: ${temporaryName}.`)
      }
      const definition = await reference.execute({
        sql: "SELECT sql FROM sqlite_schema WHERE type = 'table' AND name = ?",
        args: [name],
      })
      const createSql = String(definition.rows[0].sql)
        .replace(/^CREATE TABLE\s+[`"]?\w+[`"]?/i, `CREATE TABLE ${identifier(temporaryName)}`)
      const columns = actual.columns.map((column) => identifier(String(column.name))).join(', ')
      statements.push(
        createSql,
        `INSERT INTO ${identifier(temporaryName)} (${columns}) SELECT ${columns} FROM ${identifier(name)}`,
        `DROP TABLE ${identifier(name)}`,
        `ALTER TABLE ${identifier(temporaryName)} RENAME TO ${identifier(name)}`,
      )
    }
    const indexes = await reference.execute("SELECT sql FROM sqlite_schema WHERE type = 'index' AND sql IS NOT NULL")
    statements.push(...indexes.rows.map((row) => String(row.sql)))
    statements.push('CREATE TABLE IF NOT EXISTS __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)')
    for (const migration of baseline) {
      statements.push({
        sql: 'INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)',
        args: [migration.hash, migration.folderMillis],
      })
    }
    const pending = hasShortCodes
      ? await client.execute('SELECT COUNT(*) AS count FROM uploaded_files WHERE shortCode IS NULL')
      : { rows: [{ count: tables.find((table) => table.name === 'uploaded_files')!.rows }] }
    if (!checkOnly) {
      // One atomic batch avoids an interactive transaction expiring between network calls.
      await client.batch(statements, 'write')
    }
    return {
      alreadyManaged: false,
      tables,
      pendingShortCodes: Number(pending.rows[0].count),
      backfilled: checkOnly ? 0 : await backfillShortCodes(client),
    }
  } finally {
    reference.close()
  }
}
