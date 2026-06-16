import { ensureDbInitialized } from '../db'
import { handleStartCommand, isStartCommand } from './bind'
import { getRequestedFilesPage, renderFilesList } from './files'
import {
  answerTelegramCallbackQuery,
  botMainMenu,
  editTelegramMessageText,
  hasBotToken,
  sendTelegramMessage,
} from './telegram-api'
import type { TelegramUpdate } from './types'
import { getMessageFile, handleFileUpload } from './upload'
import { getTelegramBoundUser, isTelegramUserAllowed } from './users'

export type {
  TelegramCallbackQuery,
  TelegramChat,
  TelegramDocument,
  TelegramMessage,
  TelegramPhotoSize,
  TelegramUpdate,
  TelegramUser,
} from './types'
export { botMainMenu, sendTelegramMessage } from './telegram-api'

export async function handleTelegramUpdate(update: TelegramUpdate) {
  await ensureDbInitialized()

  if (!hasBotToken()) {
    console.error('TELEGRAM_BOT_TOKEN is not configured.')
    return
  }

  if (update.callback_query) {
    await handleCallbackQuery(update.callback_query)
    return
  }

  const message = update.message
  if (!message) return

  const chatId = message.chat.id
  const fromId = message.from?.id
  const fromUsername = message.from?.username
  const text = message.text

  if (!fromId) return

  if (!isTelegramUserAllowed(fromId, fromUsername)) {
    await sendTelegramMessage(
      chatId,
      `❌ <b>Access Denied:</b>\nYou are not authorized to use this bot.`
    )
    return
  }

  if (text && isStartCommand(text)) {
    await handleStartCommand(chatId, fromId, text)
    return
  }

  const file = getMessageFile(message)
  if (file) {
    await handleFileUpload(chatId, fromId, file.fileId, file.fileName)
    return
  }

  if (text) {
    await handleTextMessage(chatId, fromId, text)
  }
}

async function handleCallbackQuery(callbackQuery: NonNullable<TelegramUpdate['callback_query']>) {
  await answerTelegramCallbackQuery(callbackQuery.id)

  const data = callbackQuery.data || ''
  const pageMatch = data.match(/^files:(\d+)$/)
  const message = callbackQuery.message

  if (!pageMatch || !message) {
    return
  }

  try {
    if (!isTelegramUserAllowed(callbackQuery.from.id, callbackQuery.from.username)) {
      await editTelegramMessageText(
        message.chat.id,
        message.message_id,
        `❌ <b>Access Denied:</b>\nYou are not authorized to use this bot.`
      )
      return
    }

    const user = await getTelegramBoundUser(callbackQuery.from.id)
    if (!user) {
      await editTelegramMessageText(
        message.chat.id,
        message.message_id,
        '❌ <b>Access Denied:</b>\nYour Telegram account is not bound to a CraneMail account. Please sign in to the website and click <b>"Link Telegram Bot"</b> first.',
      )
      return
    }

    const page = Number.parseInt(pageMatch[1], 10)
    const list = await renderFilesList(user, page)
    await editTelegramMessageText(message.chat.id, message.message_id, list.text, list.replyMarkup)
  } catch (err) {
    console.error('Telegram bot list files callback error:', err)
    await editTelegramMessageText(message.chat.id, message.message_id, '❌ <b>Failed to list files:</b> An error occurred.')
  }
}

async function handleTextMessage(chatId: number, fromId: number, text: string) {
  const isListCommand =
    text.startsWith('/list') ||
    text.startsWith('/files') ||
    text.includes('My Files') ||
    text.includes('我的文件')

  if (isListCommand) {
    try {
      const user = await getTelegramBoundUser(fromId)

      if (!user) {
        await sendTelegramMessage(
          chatId,
          '❌ <b>Access Denied:</b>\nYour Telegram account is not bound to a CraneMail account. Please sign in to the website and click <b>"Link Telegram Bot"</b> first.',
          botMainMenu
        )
        return
      }

      const list = await renderFilesList(user, getRequestedFilesPage(text))
      await sendTelegramMessage(chatId, list.text, list.replyMarkup)
    } catch (err) {
      console.error('Telegram bot list files error:', err)
      await sendTelegramMessage(chatId, '❌ <b>Failed to list files:</b> An error occurred.', botMainMenu)
    }
    return
  }

  if (text.includes('Help') || text.includes('帮助') || text.startsWith('/help')) {
    await sendTelegramMessage(
      chatId,
      `💬 Send me a file to upload it directly to your CraneMail cloud drive!\n\nUse <code>/start</code> to view configuration instructions.\nUse <code>📂 My Files</code> or <code>/files</code> to see your recently uploaded files.`,
      botMainMenu
    )
    return
  }

  await sendTelegramMessage(
    chatId,
    `💬 Send me a file to upload it directly to your CraneMail cloud drive!\n\nUse <code>/start</code> to view configuration instructions.`,
    botMainMenu
  )
}
