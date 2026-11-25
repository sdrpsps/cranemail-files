import { config } from 'dotenv'
import { setTimeout as delay } from 'node:timers/promises'

// Load deployment settings before importing database or encryption modules.
config({ path: '.env.local', quiet: true })
config({ path: '.env', quiet: true })

async function main() {
  const { db, client, ensureDbInitialized, telegramBots } = await import('../lib/db')
  try {
    await ensureDbInitialized()
    const botId = process.argv[2]
    if (!botId) {
      console.log('Usage: pnpm dev:bot <bot-id>\nConfigured bots:')
      const bots = await db.select({ id: telegramBots.id, username: telegramBots.username }).from(telegramBots)
      for (const bot of bots) console.log(`  ${bot.id}  @${bot.username}`)
      return
    }
    const { findBotRuntime } = await import('../lib/bot/config')
    const runtime = await findBotRuntime(botId)
    if (!runtime) throw new Error('Bot not found. Connect it on the dashboard first.')
    const { getTelegramApi, withBotRuntime } = await import('../lib/bot/runtime')
    const { handleTelegramUpdate } = await import('../lib/bot')
    const api = getTelegramApi(runtime.token)
    const abort = new AbortController()
    // grammY accepts native signals at runtime but types its older Node polyfill.
    const signal = abort.signal as unknown as Parameters<typeof api.getUpdates>[1]
    const stop = () => abort.abort()
    process.once('SIGINT', stop)
    process.once('SIGTERM', stop)
    try {
      console.log(`Polling @${runtime.info?.username}. This removes its webhook; use a dedicated development bot.`)
      await api.deleteWebhook({}, signal)
      let offset = 0
      while (!abort.signal.aborted) {
        try {
          const updates = await api.getUpdates({ offset, timeout: 30, allowed_updates: ['message', 'callback_query'] }, signal)
          for (const update of updates) {
            if (abort.signal.aborted) break
            await withBotRuntime(runtime, () => handleTelegramUpdate(update))
            offset = update.update_id + 1
          }
        } catch {
          if (abort.signal.aborted) break
          console.error('Polling failed; retrying in one second.')
          await delay(1000, undefined, { signal: abort.signal }).catch(() => {})
        }
      }
    } finally {
      process.removeListener('SIGINT', stop)
      process.removeListener('SIGTERM', stop)
    }
  } finally {
    client.close()
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error && error.message.startsWith('Database is not ready')
    ? error.message : 'Could not start polling. Check the bot ID, database configuration, and encryption key.')
  process.exitCode = 1
})
