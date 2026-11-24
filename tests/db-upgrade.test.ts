import assert from 'node:assert/strict'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { test, type TestContext } from 'node:test'
import { createClient, type Client } from '@libsql/client'
import { drizzle } from 'drizzle-orm/libsql'
import { migrate } from 'drizzle-orm/libsql/migrator'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { adoptDatabase } from '../lib/db/adopt'

const tables = ['users', 'app_sessions', 'smartermail_sessions', 'bind_tokens', 'uploaded_files']

async function legacyDatabase(t: TestContext) {
  const directory = mkdtempSync(path.join(tmpdir(), 'cranemail-adopt-'))
  const client = createClient({ url: `file:${path.join(directory, 'legacy.db')}` })
  t.after(() => {
    client.close()
    rmSync(directory, { recursive: true, force: true })
  })
  const sql = readFileSync(path.join(process.cwd(), 'tests/fixtures/legacy-schema.sql'), 'utf8')
  await client.executeMultiple(sql)
  await client.batch([
    "INSERT INTO users VALUES ('u1', 'owner@example.com', 'https://mail.example', '123', 'encrypted-test-value', '2026-01-01', NULL)",
    "INSERT INTO app_sessions VALUES ('s1', 'u1', '2030-01-01', '2026-01-01', NULL)",
    "INSERT INTO smartermail_sessions VALUES ('u1', 'access-test', '2030-01-01', 'refresh-test', '2031-01-01', '2026-01-01', NULL)",
    "INSERT INTO bind_tokens VALUES ('b1', 'u1', '2030-01-01', '2026-01-01')",
    ...Array.from({ length: 205 }, (_, index) => ({
      sql: 'INSERT INTO uploaded_files VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      args: [`f${index}`, 'owner@example.com', `remote-${index}`, `${index}.png`, `/d/${index}.png`, index, 'web', '2026-01-01'],
    })),
  ], 'write')
  return { client, directory }
}

async function contents(client: Client) {
  return Promise.all(tables.map(async (table) => ({
    table,
    rows: (await client.execute(`SELECT * FROM ${table} ORDER BY 1`)).rows,
  })))
}

async function structure(client: Client) {
  return Promise.all(tables.map(async (table) => ({
    table,
    columns: (await client.execute(`PRAGMA table_info(${table})`)).rows,
    indexes: (await client.execute(`PRAGMA index_list(${table})`)).rows
      .map(({ name, unique, origin, partial }) => ({ name, unique, origin, partial }))
      .sort((a, b) => String(a.name).localeCompare(String(b.name))),
  })))
}

test('preflight validates the exact pre-Drizzle schema without changing schema or data', async (t) => {
  const { client } = await legacyDatabase(t)
  const before = await contents(client)
  const schema = await client.execute('SELECT * FROM sqlite_schema ORDER BY name')
  const result = await adoptDatabase(client, { checkOnly: true })
  assert.equal(result.pendingShortCodes, 205)
  assert.equal(result.backfilled, 0)
  assert.deepEqual(await contents(client), before)
  assert.deepEqual((await client.execute('SELECT * FROM sqlite_schema ORDER BY name')).rows, schema.rows)
})

test('adoption preserves all legacy values and produces the same schema and ledger as real migrations', async (t) => {
  const { client, directory } = await legacyDatabase(t)
  const before = await contents(client)
  const result = await adoptDatabase(client)
  assert.equal(result.backfilled, 205)
  const after = await contents(client)
  for (let index = 0; index < before.length; index++) {
    assert.deepEqual(after[index].rows.map((row) => {
      const original = { ...row }
      delete original.shortCode
      return original
    }), before[index].rows)
  }
  const files = await client.execute('SELECT shortCode FROM uploaded_files')
  assert.ok(files.rows.every((row) => /^[0-9a-z]{7}$/.test(String(row.shortCode))))
  assert.equal(new Set(files.rows.map((row) => row.shortCode)).size, 205)
  const reference = createClient({ url: `file:${path.join(directory, 'fresh.db')}` })
  try {
    await migrate(drizzle(reference), { migrationsFolder: './drizzle' })
    assert.deepEqual(await structure(client), await structure(reference))
    const history = await client.execute('SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at')
    assert.deepEqual(history.rows, (await reference.execute('SELECT hash, created_at FROM __drizzle_migrations ORDER BY created_at')).rows)
    await migrate(drizzle(client), { migrationsFolder: './drizzle' })
    const repeated = await adoptDatabase(client)
    assert.equal(repeated.alreadyManaged, true)
    assert.equal(repeated.backfilled, 0)
    assert.deepEqual(await contents(client), after)
  } finally {
    reference.close()
  }
})

test('existing short codes survive adoption, and an interrupted backfill can resume', async (t) => {
  const { client } = await legacyDatabase(t)
  await client.execute('ALTER TABLE uploaded_files ADD COLUMN shortCode TEXT')
  await client.execute("UPDATE uploaded_files SET shortCode = 'Ab12cDe' WHERE id = 'f0'")
  const batch = client.batch.bind(client)
  const failure = t.mock.method(client, 'batch', async (...args: Parameters<Client['batch']>) => {
    if (args[0].some((statement) => typeof statement !== 'string'
      && !Array.isArray(statement) && statement.sql.startsWith('UPDATE uploaded_files'))) {
      throw new Error('simulated backfill interruption')
    }
    return batch(...args)
  })
  await assert.rejects(adoptDatabase(client), /simulated backfill interruption/)
  failure.mock.restore()
  assert.equal((await client.execute('SELECT COUNT(*) AS count FROM __drizzle_migrations')).rows[0].count, 2)
  const check = await adoptDatabase(client, { checkOnly: true })
  assert.equal(check.pendingShortCodes, 204)
  assert.equal(check.backfilled, 0)
  const resumed = await adoptDatabase(client)
  assert.equal(resumed.alreadyManaged, true)
  assert.equal(resumed.backfilled, 204)
  assert.equal((await client.execute("SELECT shortCode FROM uploaded_files WHERE id = 'f0'")).rows[0].shortCode, 'Ab12cDe')
})

test('a failing schema batch rolls back table copies and migration history together', async (t) => {
  const { client } = await legacyDatabase(t)
  const before = await contents(client)
  const schema = await structure(client)
  const batch = client.batch.bind(client)
  t.mock.method(client, 'batch', (statements: Parameters<Client['batch']>[0]) =>
    batch([...statements, 'INSERT INTO missing_adoption_table VALUES (1)'], 'write'))
  await assert.rejects(adoptDatabase(client), /missing_adoption_table/)
  assert.deepEqual(await contents(client), before)
  assert.deepEqual(await structure(client), schema)
  assert.equal((await client.execute("SELECT name FROM sqlite_schema WHERE name = '__drizzle_migrations' OR name LIKE '__adopt_%'")).rows.length, 0)
})

test('later migrations run normally after adoption instead of being skipped by the baseline', async (t) => {
  const { client, directory } = await legacyDatabase(t)
  const folder = path.join(directory, 'drizzle')
  cpSync('drizzle', folder, { recursive: true })
  const journalPath = path.join(folder, 'meta/_journal.json')
  const journal = JSON.parse(readFileSync(journalPath, 'utf8'))
  const when = journal.entries[1].when + 1
  journal.entries.push({ idx: 2, version: '6', when, tag: '0002_test', breakpoints: true })
  writeFileSync(journalPath, JSON.stringify(journal))
  writeFileSync(path.join(folder, '0002_test.sql'), 'ALTER TABLE uploaded_files ADD migrationProbe text;')
  await adoptDatabase(client, { migrationsFolder: folder })
  assert.equal((await client.execute('PRAGMA table_info(uploaded_files)')).rows.some((row) => row.name === 'migrationProbe'), false)
  await migrate(drizzle(client), { migrationsFolder: folder })
  await migrate(drizzle(client), { migrationsFolder: folder })
  assert.equal((await client.execute('PRAGMA table_info(uploaded_files)')).rows.some((row) => row.name === 'migrationProbe'), true)
  assert.equal((await client.execute('SELECT COUNT(*) AS count FROM __drizzle_migrations')).rows[0].count, 3)
  assert.equal((await adoptDatabase(client, { migrationsFolder: folder })).alreadyManaged, true)
})

for (const scenario of [
  { name: 'NULL primary keys', sql: 'INSERT INTO users (id) VALUES (NULL)', error: /NULL values in users.id/ },
  { name: 'unknown columns', sql: 'ALTER TABLE users ADD customData TEXT', error: /Unexpected column definition/ },
  { name: 'custom indexes', sql: 'CREATE INDEX custom_email ON users (email)', error: /Unsupported index/ },
  { name: 'custom triggers', sql: 'CREATE TRIGGER custom_trigger AFTER INSERT ON users BEGIN SELECT 1; END', error: /Custom trigger/ },
  { name: 'foreign keys from another table', sql: 'CREATE TABLE dependent (userId TEXT REFERENCES users(id))', error: /Foreign keys/ },
  { name: 'missing tables', sql: 'DROP TABLE bind_tokens', error: /Missing legacy table/ },
]) {
  test(`adoption refuses ${scenario.name} without changing data`, async (t) => {
    const { client } = await legacyDatabase(t)
    await client.execute(scenario.sql)
    const before = await client.execute('SELECT * FROM sqlite_schema ORDER BY name')
    await assert.rejects(adoptDatabase(client), scenario.error)
    assert.deepEqual((await client.execute('SELECT * FROM sqlite_schema ORDER BY name')).rows, before.rows)
    assert.equal((await client.execute('SELECT COUNT(*) AS count FROM uploaded_files')).rows[0].count, 205)
  })
}

test('duplicate existing codes are reported before adoption changes anything', async (t) => {
  const { client } = await legacyDatabase(t)
  await client.execute('ALTER TABLE uploaded_files ADD shortCode TEXT')
  await client.execute("UPDATE uploaded_files SET shortCode = 'Ab12cDe' WHERE id IN ('f0', 'f1')")
  await assert.rejects(adoptDatabase(client), /Duplicate values in uploaded_files/)
  assert.equal((await client.execute("SELECT name FROM sqlite_schema WHERE name = '__drizzle_migrations'")).rows.length, 0)
})

test('an empty migration ledger left by a failed earlier migrate is safe to adopt', async (t) => {
  const { client } = await legacyDatabase(t)
  await client.execute('CREATE TABLE __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)')
  await adoptDatabase(client)
  assert.equal((await client.execute('SELECT COUNT(*) AS count FROM __drizzle_migrations')).rows[0].count, 2)
})

test('partial or mismatched history is never overwritten', async (t) => {
  const { client } = await legacyDatabase(t)
  const first = readMigrationFiles({ migrationsFolder: './drizzle' })[0]
  await client.execute('CREATE TABLE __drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at numeric)')
  await client.execute({ sql: 'INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)', args: [first.hash, first.folderMillis] })
  await assert.rejects(adoptDatabase(client), /partial or differs/)
  await client.execute({ sql: 'INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)', args: ['incorrect-hash', first.folderMillis + 1] })
  await assert.rejects(adoptDatabase(client), /partial or differs/)
  assert.equal((await client.execute('SELECT COUNT(*) AS count FROM __drizzle_migrations')).rows[0].count, 2)
})
