import { Bot } from 'grammy'
import type { Update } from 'grammy/types'
import { ensureDbInitialized } from '../db'
import { handleStartCommand } from './bind'
import { getRequestedFilesPage, renderFileSearch, renderFilesList } from './files'
import { getBotRuntime, telegramClientOptions } from './runtime'
import {
  botMainMenu, escapeTelegramHtml, sendTelegramMessage,
  answerTelegramCallbackQuery, editTelegramMessageText,
} from './telegram-api'
import type { TelegramUpdate } from './types'
import { getMessageFile, handleFileUpload } from './upload'
import { getTelegramAccounts, getTelegramBoundUser, selectTelegramAccount } from './users'

export type { TelegramCallbackQuery, TelegramChat, TelegramDocument, TelegramMessage,
  TelegramPhotoSize, TelegramUpdate, TelegramUser } from './types'
export { botMainMenu, sendTelegramMessage } from './telegram-api'

async function showAccounts(chatId: number, fromId: number) {
  const accounts = await getTelegramAccounts(fromId)
  const selected = await getTelegramBoundUser(fromId)
  if (!accounts.length) {
    await sendTelegramMessage(chatId, 'No accounts linked. Sign in on the website and open <b>Telegram Bots</b> to link an account.', botMainMenu)
    return
  }
  await sendTelegramMessage(chatId,
    `👤 <b>Choose your upload account</b>\nCurrent: ${selected ? `<code>${escapeTelegramHtml(selected.email)}</code>` : 'none — select an account below'}\n\nAdd more accounts by signing into each one on the website and linking this bot.`, {
      inline_keyboard: accounts.map((user) => [{
        text: `${user.id === selected?.id ? '✓ ' : ''}${user.email}`,
        callback_data: `account:${user.id}`,
      }]),
    })
}

async function showFiles(chatId: number, fromId: number, text: string) {
  const user = await getTelegramBoundUser(fromId)
  if (!user) {
    await showAccounts(chatId, fromId)
    return
  }
  const list = await renderFilesList(user, getRequestedFilesPage(text))
  await sendTelegramMessage(chatId, list.text, list.replyMarkup)
}

async function searchFiles(chatId: number, fromId: number, query: string) {
  if (!query) {
    await sendTelegramMessage(chatId, 'Send <code>/search filename</code> using any part of the filename.', botMainMenu)
    return
  }
  const user = await getTelegramBoundUser(fromId)
  if (!user) return showAccounts(chatId, fromId)

  await sendTelegramMessage(chatId, await renderFileSearch(user, query), botMainMenu)
}

async function showHelp(chatId: number) {
  await sendTelegramMessage(chatId, [
    'Send a photo or document to upload.',
    '/files — list files in the current account',
    '/search filename — find files by name',
    '/accounts — switch upload account',
    '/start — linking instructions',
  ].join('\n'), botMainMenu)
}

export async function handleTelegramUpdate(update: TelegramUpdate) {
  await ensureDbInitialized()
  const runtime = getBotRuntime()
  if (!runtime.token) throw new Error('No Telegram bot configured.')
  // Per-request instances avoid shared mutable credentials in concurrent webhooks.
  const bot = new Bot(runtime.token, { botInfo: runtime.info, client: telegramClientOptions })
  bot.use(async (ctx, next) => {
    if (!ctx.from) return
    if (ctx.chat?.type !== 'private') {
      if (ctx.callbackQuery) await ctx.answerCallbackQuery()
      if (ctx.chat) await ctx.reply('Please use this bot in a private chat to manage your accounts and files.')
      return
    }
    await next()
  })
  bot.command('start', (ctx) => handleStartCommand(ctx.chat.id, ctx.from!.id, ctx.msg.text, ctx.update.update_id))
  bot.command('accounts', (ctx) => showAccounts(ctx.chat.id, ctx.from!.id))
  bot.command(['files', 'list'], (ctx) => showFiles(ctx.chat.id, ctx.from!.id, ctx.msg.text))
  bot.command('search', (ctx) => searchFiles(ctx.chat.id, ctx.from!.id, ctx.match.trim()))
  bot.command('help', (ctx) => showHelp(ctx.chat.id))
  bot.callbackQuery(/^account:(.+)$/, async (ctx) => {
    await ctx.answerCallbackQuery()
    const account = await selectTelegramAccount(ctx.from.id, ctx.match[1])
    await ctx.reply(account ? `Uploads will now go to ${account.email}.` : 'This account is no longer linked. Use /accounts to select an account.')
  })
  bot.on('callback_query:data', async (ctx) => {
    await answerTelegramCallbackQuery(ctx.callbackQuery.id)
    const match = ctx.callbackQuery.data.match(/^files:(?:(.+):)?(\d+)$/)
    const message = ctx.callbackQuery.message
    if (!match || !message) return
    // Old file-list buttons keep referring to the account that produced the list.
    const user = match[1]
      ? (await getTelegramAccounts(ctx.from.id)).find((account) => account.id === match[1])
      : await getTelegramBoundUser(ctx.from.id)
    if (!user) {
      await ctx.reply('This account is no longer available. Use /accounts to select an account.')
      return
    }
    const list = await renderFilesList(user, Number.parseInt(match[2], 10))
    const markup = 'inline_keyboard' in list.replyMarkup ? list.replyMarkup : undefined
    await editTelegramMessageText(message.chat.id, message.message_id, list.text, markup)
  })
  bot.on('message', async (ctx) => {
    const file = getMessageFile(ctx.message)
    if (file) {
      await handleFileUpload(ctx.chat.id, ctx.from.id, file.fileId, file.fileName)
      return
    }
    const text = ctx.message.text || ''
    if (text.includes('Accounts')) await showAccounts(ctx.chat.id, ctx.from.id)
    else if (text.includes('My Files')) await showFiles(ctx.chat.id, ctx.from.id, text)
    else await showHelp(ctx.chat.id)
  })
  if (!runtime.info) await bot.init()
  await bot.handleUpdate(update as Update)
}
