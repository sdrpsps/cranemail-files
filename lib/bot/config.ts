import crypto from 'node:crypto'
import { and, eq } from 'drizzle-orm'
import { getDb, telegramBotAccounts, telegramBots, telegramBindings } from '../db'
import { decrypt, encrypt } from '../crypto'
import type { BotFullInfo } from 'grammy/types'
import { getTelegramApi, type BotRuntime } from './runtime'

export async function findBotRuntime(id: string): Promise<BotRuntime | undefined> {
  const [bot] = await getDb().select().from(telegramBots).where(eq(telegramBots.id, id)).limit(1)
  if (!bot) return undefined
  return {
    id, token: decrypt(bot.encryptedToken),
    info: JSON.parse(bot.botInfo) as BotFullInfo,
  }
}

export async function hasBotAccess(botId: string, userId: string) {
  const [access] = await getDb().select().from(telegramBotAccounts)
    .where(and(eq(telegramBotAccounts.botId, botId), eq(telegramBotAccounts.userId, userId))).limit(1)
  return Boolean(access)
}

export async function listUserBots(userId: string) {
  const db = getDb()
  const bots = await db.select({
    id: telegramBots.id, username: telegramBots.username, firstName: telegramBots.firstName,
  }).from(telegramBotAccounts).innerJoin(telegramBots, eq(telegramBots.id, telegramBotAccounts.botId))
    .where(eq(telegramBotAccounts.userId, userId))
  const bindings = await db.select().from(telegramBindings).where(eq(telegramBindings.userId, userId))
  return bots.map((bot) => ({
    ...bot,
    telegramUserIds: bindings.filter((binding) => binding.botId === bot.id).map((binding) => binding.telegramUserId),
  }))
}

export function getWebhookOrigin() {
  // Use the configured origin, never an untrusted Host header.
  const origin = new URL(process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'http://localhost:3000')
  if (origin.protocol !== 'https:') throw new Error('Set NEXT_PUBLIC_SITE_URL to your public HTTPS domain before connecting a bot.')
  return origin.origin
}

export async function configureBot(userId: string, token: string) {
  const origin = getWebhookOrigin()
  const api = getTelegramApi(token)
  const info = await api.getMe()
  if (!info.username) throw new Error('This bot does not have a username.')

  await api.setMyCommands([
    { command: 'start', description: 'Get account linking instructions' },
    { command: 'accounts', description: 'Choose an account for uploads' },
    { command: 'files', description: 'List files in the selected account' },
    { command: 'search', description: 'Find files by name in the selected account' },
    { command: 'help', description: 'Show upload and command help' },
  ], { scope: { type: 'all_private_chats' } })

  const newId = crypto.randomUUID()
  const newSecret = crypto.randomBytes(32).toString('hex')
  // A Telegram bot has one identity even when several CraneMail accounts configure it.
  const db = getDb()
  await db.insert(telegramBots).values({
    id: newId, telegramId: String(info.id), username: info.username, firstName: info.first_name,
    botInfo: JSON.stringify(info),
    encryptedToken: encrypt(token), webhookSecret: newSecret,
  }).onConflictDoNothing({ target: telegramBots.telegramId })
  const [bot] = await db.select().from(telegramBots).where(eq(telegramBots.telegramId, String(info.id)))

  await api.setWebhook(`${origin}/api/telegram/webhook/${bot.id}`, {
    secret_token: bot.webhookSecret,
    allowed_updates: ['message', 'callback_query'],
  })
  await db.batch([
    db.update(telegramBots).set({
      username: info.username!, firstName: info.first_name, botInfo: JSON.stringify(info), encryptedToken: encrypt(token),
    }).where(eq(telegramBots.id, bot.id)),
    db.insert(telegramBotAccounts).values({ botId: bot.id, userId }).onConflictDoNothing(),
  ])
  return { id: bot.id, username: info.username }
}
