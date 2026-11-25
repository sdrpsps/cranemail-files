import crypto from 'node:crypto'
import { and, eq, lt } from 'drizzle-orm'
import { Hono, type Context } from 'hono'
import { GrammyError } from 'grammy'
import { handleTelegramUpdate } from '@/lib/bot'
import { configureBot, findBotRuntime, hasBotAccess, listUserBots } from '@/lib/bot/config'
import { withBotRuntime } from '@/lib/bot/runtime'
import { bindTokens, db, telegramBindings, telegramBots, telegramBotAccounts, telegramUpdates } from '@/lib/db'
import { apiError, apiSuccess } from '@/lib/response'
import { requireCurrentUser } from '../_middleware'

const telegramApp = new Hono()

telegramApp.get('/bots', async (c) => {
  const user = await requireCurrentUser(c)
  return apiSuccess(c, await listUserBots(user.id))
})

telegramApp.post('/bots', async (c) => {
  const user = await requireCurrentUser(c)
  const { token } = await c.req.json()
  if (typeof token !== 'string' || !/^\d+:[A-Za-z0-9_-]{20,}$/.test(token.trim())) {
    return apiError(c, 'Enter a valid bot token from BotFather.', 400)
  }
  try {
    const bot = await configureBot(user.id, token.trim())
    return apiSuccess(c, bot, 'Bot connected and webhook registered.')
  } catch (error) {
    // Do not log HTTP client errors or echo credentials from Telegram requests.
    const message = error instanceof GrammyError
      ? `Telegram rejected the configuration: ${error.description}`
      : 'Could not connect the bot. Check the token and ensure NEXT_PUBLIC_SITE_URL is your public HTTPS domain.'
    return apiError(c, message, 400)
  }
})

// Removing a bot affects this CraneMail account only, including pending links.
telegramApp.delete('/bots/:id', async (c) => {
  const user = await requireCurrentUser(c)
  const botId = c.req.param('id')
  if (!await hasBotAccess(botId, user.id)) return apiError(c, 'Bot not found.', 404)
  await db.transaction(async (tx) => {
    const owned = and(eq(telegramBindings.botId, botId), eq(telegramBindings.userId, user.id))
    await tx.delete(telegramBindings).where(owned)
    // Keep a removed selection unavailable until the Telegram user explicitly chooses again.
    await tx.delete(bindTokens).where(and(eq(bindTokens.botId, botId), eq(bindTokens.userId, user.id)))
    await tx.delete(telegramBotAccounts).where(and(eq(telegramBotAccounts.botId, botId), eq(telegramBotAccounts.userId, user.id)))
  })
  return apiSuccess(c, null, 'Disconnected from this CraneMail account.')
})

function matchesSecret(actual: string | undefined, expected: string) {
  if (!actual) return false
  const a = Buffer.from(actual)
  const b = Buffer.from(expected)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

async function receiveWebhook(c: Context, botId: string) {
  const runtime = await findBotRuntime(botId)
  if (!runtime) return c.json({ ok: false }, 404)
  const [bot] = await db.select({ secret: telegramBots.webhookSecret }).from(telegramBots).where(eq(telegramBots.id, botId))
  if (!bot?.secret || !matchesSecret(c.req.header('X-Telegram-Bot-Api-Secret-Token'), bot.secret)) {
    return c.json({ ok: false }, 403)
  }
  let update
  try { update = await c.req.json() } catch { return c.json({ ok: false }, 400) }
  if (!update || !Number.isSafeInteger(update.update_id) || update.update_id < 0) return c.json({ ok: false }, 400)
  const key = and(eq(telegramUpdates.botId, botId), eq(telegramUpdates.updateId, update.update_id))
  const now = new Date().toISOString()
  const [claimed] = await db.insert(telegramUpdates).values({
    botId, updateId: update.update_id, createdAt: now,
  }).onConflictDoNothing().returning()
  if (!claimed) {
    const [existing] = await db.select().from(telegramUpdates).where(key)
    if (existing?.processed) return c.json({ ok: true })
    // Another request is running. Recover abandoned claims after ten minutes.
    const [reclaimed] = await db.update(telegramUpdates).set({ createdAt: now })
      .where(and(key, eq(telegramUpdates.processed, false), lt(telegramUpdates.createdAt, new Date(Date.now() - 600_000).toISOString())))
      .returning()
    if (!reclaimed) return c.json({ ok: false }, 503)
  }
  try {
    await withBotRuntime(runtime, () => handleTelegramUpdate(update))
    await db.update(telegramUpdates).set({ processed: true }).where(key)
    return c.json({ ok: true })
  } catch {
    await db.delete(telegramUpdates).where(key)
    // A non-success response lets Telegram retry a transient failure.
    return c.json({ ok: false }, 500)
  }
}

telegramApp.post('/webhook/:id', (c) => receiveWebhook(c, c.req.param('id')))

export default telegramApp
