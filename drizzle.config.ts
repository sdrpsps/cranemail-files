import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

config({ path: '.env.local' })
config({ path: '.env' })

const tursoUrl = process.env.TURSO_DATABASE_URL?.trim()
const isRemoteTurso = Boolean(tursoUrl && !tursoUrl.startsWith('file:'))

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'turso',
  dbCredentials: isRemoteTurso
    ? {
        url: tursoUrl!,
        authToken: process.env.TURSO_AUTH_TOKEN?.trim() || undefined,
      }
    : {
        url: tursoUrl || 'file:local.db',
      },
})
