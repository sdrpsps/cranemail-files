import { createClient } from '@libsql/client'
import { config } from 'dotenv'
import { adoptDatabase } from '../lib/db/adopt'

async function main() {
  const args = process.argv.slice(2)
  if (args.some((arg) => arg !== '--check')) throw new Error('Usage: pnpm db:adopt [--check]')
  config({ path: '.env.local', quiet: true })
  config({ path: '.env', quiet: true })
  const url = process.env.TURSO_DATABASE_URL?.trim()
  if (!url) throw new Error('Set TURSO_DATABASE_URL explicitly (use file:local.db for local development).')
  const authToken = url.startsWith('file:') ? undefined : process.env.TURSO_AUTH_TOKEN?.trim()
  const checkOnly = args.includes('--check')
  const client = createClient({ url, ...(authToken ? { authToken } : {}) })
  // Never print credentials or tokens embedded in a database URL.
  console.log(`[Database] ${checkOnly ? 'Checking' : 'Adopting'} ${url.startsWith('file:') ? 'local SQLite' : 'remote Turso'} database.`)
  try {
    const result = await adoptDatabase(client, { checkOnly })
    for (const table of result.tables) console.log(`  ${table.name}: ${table.rows} rows`)
    console.log(`  Pending short codes: ${result.pendingShortCodes}`)
    if (checkOnly) {
      console.log(result.alreadyManaged
        ? '[Database] Migration history matches. No changes made.'
        : '[Database] Preflight passed. No changes made. Back up and pause writes before running db:adopt.')
    } else {
      console.log(`[Database] ${result.alreadyManaged ? 'Already managed by Drizzle' : 'Drizzle baseline registered'}; ${result.backfilled} short codes backfilled.`)
      console.log('[Database] Run db:migrate to apply any later migrations before deploying.')
    }
  } finally {
    client.close()
  }
}

main().catch((error: unknown) => {
  console.error('[Database] Adoption failed:', error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
