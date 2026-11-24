import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, test } from 'node:test'
import { createClient } from '@libsql/client'

const tempDir = mkdtempSync(path.join(tmpdir(), 'cranemail-upgrade-'))
let database: typeof import('../lib/db')

before(async () => {
  process.env.TURSO_DATABASE_URL = `file:${path.join(tempDir, 'legacy.db')}`
  const legacy = createClient({ url: process.env.TURSO_DATABASE_URL })
  await legacy.execute(`CREATE TABLE uploaded_files (
    id TEXT PRIMARY KEY NOT NULL, email TEXT, fileId TEXT, fileName TEXT,
    publicLink TEXT, size INTEGER, source TEXT, createdAt TEXT DEFAULT (CURRENT_TIMESTAMP)
  )`)
  await legacy.batch(Array.from({ length: 205 }, (_, index) => ({
    sql: 'INSERT INTO uploaded_files (id, publicLink) VALUES (?, ?)',
    args: [`legacy-${index}`, `d/legacy-${index}.png`],
  })), 'write')
  legacy.close()
  database = await import('../lib/db')
})

after(() => {
  database?.client.close()
  rmSync(tempDir, { recursive: true, force: true })
})

test('legacy databases gain a nullable code column and a unique index', async () => {
  await Promise.all([database.initDb(), database.initDb()])
  const columns = await database.client.execute('PRAGMA table_info(uploaded_files)')
  const column = columns.rows.find((row) => row.name === 'shortCode')
  assert.ok(column)
  assert.equal(column.notnull, 0)
  const indexes = await database.client.execute('PRAGMA index_list(uploaded_files)')
  assert.ok(indexes.rows.some((row) => row.name === 'uploaded_files_shortCode_unique' && row.unique === 1))
})

test('backfill spans batches and repeated initialization keeps every code stable', async () => {
  const before = await database.client.execute('SELECT id, shortCode FROM uploaded_files ORDER BY id')
  assert.equal(before.rows.length, 205)
  assert.ok(before.rows.every((row) => /^[0-9A-Za-z]{7}$/.test(String(row.shortCode))))
  assert.equal(new Set(before.rows.map((row) => row.shortCode)).size, 205)
  await database.initDb()
  const after = await database.client.execute('SELECT id, shortCode FROM uploaded_files ORDER BY id')
  assert.deepEqual(after.rows, before.rows)
})

test('generated migrations produce the same short-code column and index', async () => {
  const migrated = createClient({ url: `file:${path.join(tempDir, 'migrated.db')}` })
  try {
    for (const file of ['0000_safe_dragon_man.sql', '0001_lean_iron_patriot.sql']) {
      const sql = readFileSync(path.join(process.cwd(), 'drizzle', file), 'utf8')
      for (const statement of sql.split('--> statement-breakpoint').filter((part) => part.trim())) {
        await migrated.execute(statement)
      }
    }
    const columns = await migrated.execute('PRAGMA table_info(uploaded_files)')
    assert.ok(columns.rows.some((row) => row.name === 'shortCode'))
    const indexes = await migrated.execute('PRAGMA index_list(uploaded_files)')
    assert.ok(indexes.rows.some((row) => row.name === 'uploaded_files_shortCode_unique' && row.unique === 1))
  } finally {
    migrated.close()
  }
})
