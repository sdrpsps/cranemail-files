import { spawnSync } from 'node:child_process'
import { access, writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { unstable_readConfig } from 'wrangler'

const publicSettings = [
  'NEXT_PUBLIC_SITE_URL',
  'NEXT_PUBLIC_SMARTERMAIL_URL',
  'NEXT_PUBLIC_DISABLE_INDEXING',
  'BETTER_AUTH_URL',
  'SMARTERMAIL_CLIENT_ID',
  'PUBLIC_FOLDER',
  'TIMEZONE',
  'UPLOAD_MAX_BYTES',
]

const [mode, ...previewArgs] = process.argv.slice(2)
const isPreview = mode === '--preview'
const defaultConfig = 'wrangler.jsonc'
const buildArgs = isPreview ? ['--config', defaultConfig] : process.argv.slice(2)
const previewCommand = ['preview', '--config', defaultConfig]

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { stdio: 'inherit', env })
  if (result.error) throw result.error
  return result.status ?? 1
}

if (isPreview) {
  const { values } = parseArgs({
    args: previewArgs,
    options: {
      name: { type: 'string' },
      'secrets-file': { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
  })
  if (values.help) {
    console.log('Usage: PREVIEW_ORIGIN=https://<preview-host> pnpm preview [--name <name>] [--secrets-file <file>]')
    process.exit(0)
  }
}

const { values: flags } = parseArgs({
  args: buildArgs,
  options: {
    config: { type: 'string', short: 'c' },
    env: { type: 'string', short: 'e' },
  },
  strict: false,
})
const config = await unstable_readConfig({ config: flags.config, env: flags.env })
let vars = config.vars
if (isPreview) {
  const previewDatabase = config.previews?.d1_databases?.find(database => database.binding === 'DB')
  const migrationConfig = await unstable_readConfig({ config: 'wrangler.preview-migrations.jsonc' })
  const migrationDatabase = migrationConfig.d1_databases.find(database => database.binding === 'PREVIEW_DB')
  const databaseId = previewDatabase?.database_id
  if (
    !databaseId || databaseId === '<REPLACE_ME>' ||
    config.d1_databases.some(database => database.database_id === databaseId) ||
    databaseId !== migrationDatabase?.database_id ||
    previewDatabase.database_name !== migrationDatabase.database_name ||
    (config.account_id && migrationConfig.account_id && config.account_id !== migrationConfig.account_id)
  ) {
    throw new Error('Configure the same dedicated Preview D1 database in wrangler.jsonc and wrangler.preview-migrations.jsonc.')
  }

  const origin = process.env.PREVIEW_ORIGIN?.trim()
  const url = URL.parse(origin ?? '')
  if (!url || url.protocol !== 'https:' || url.origin !== origin || [
    config.vars.NEXT_PUBLIC_SITE_URL,
    config.vars.BETTER_AUTH_URL,
  ].some(value => URL.parse(value ?? '')?.origin === origin)) {
    throw new Error('Set PREVIEW_ORIGIN to the stable HTTPS origin for this Preview, without a trailing slash.')
  }
  vars = { ...config.previews.vars, NEXT_PUBLIC_SITE_URL: origin, BETTER_AUTH_URL: origin }
  previewCommand.push(
    ...previewArgs,
    '--var', `NEXT_PUBLIC_SITE_URL:${origin}`,
    '--var', `BETTER_AUTH_URL:${origin}`,
  )
}
const settings = Object.fromEntries(publicSettings.map(key => [key, String(vars[key] ?? '')]))
const buildStatus = run('opennextjs-cloudflare', ['build', ...buildArgs], { ...process.env, ...settings })

const envModule = new URL('../../.open-next/cloudflare/next-env.mjs', import.meta.url)
try {
  await access(envModule)
} catch (error) {
  if (buildStatus !== 0 && error.code === 'ENOENT') process.exit(buildStatus)
  throw error
}
const sanitized = ['production', 'development', 'test'].map(
  mode => `export const ${mode} = ${JSON.stringify(settings)};\n`,
)
await writeFile(envModule, sanitized.join(''))
process.exitCode = isPreview && buildStatus === 0 ? run('wrangler', previewCommand) : buildStatus
