import { count, desc, eq } from 'drizzle-orm'
import { db, uploadedFiles } from '../db'
import { getPublicUrl } from '../format'
import { buildShortUrl } from '../shortlink'
import { botMainMenu, escapeTelegramHtml } from './telegram-api'
import type { UserRow } from './types'

const BOT_FILES_PER_PAGE = 6

function getSourceIcon(source?: string | null) {
  if (source === 'telegram') return '🤖'
  if (source === 'workspace') return '💼'
  return '💻'
}

export function getRequestedFilesPage(text: string) {
  const match = text.match(/^\/(?:files|list)(?:@\w+)?(?:\s+(\d+))?$/i)
  if (!match?.[1]) return 1

  const page = Number.parseInt(match[1], 10)
  return Number.isFinite(page) && page > 0 ? page : 1
}

export async function renderFilesList(user: UserRow, requestedPage: number) {
  const [countRow] = await db
    .select({ total: count() })
    .from(uploadedFiles)
    .where(eq(uploadedFiles.email, user.email))
  const total = countRow?.total ?? 0

  if (total === 0) {
    return {
      text: `👤 <code>${escapeTelegramHtml(user.email)}</code>\n📂 <b>No uploaded files found.</b>\nSend me a file to start uploading!`,
      replyMarkup: botMainMenu,
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / BOT_FILES_PER_PAGE))
  const page = Math.min(Math.max(1, requestedPage), pageCount)
  const offset = (page - 1) * BOT_FILES_PER_PAGE
  const files = await db
    .select()
    .from(uploadedFiles)
    .where(eq(uploadedFiles.email, user.email))
    .orderBy(desc(uploadedFiles.createdAt))
    .limit(BOT_FILES_PER_PAGE)
    .offset(offset)

  let responseText = `👤 <code>${escapeTelegramHtml(user.email)}</code>\n📂 <b>Your Uploaded Files</b> (${page}/${pageCount}, ${total} total)\n\n`
  files.forEach((file, index) => {
    const dateStr = file.createdAt ? new Date(file.createdAt).toLocaleString('zh-CN', { timeZone: process.env.TIMEZONE || 'Asia/Shanghai' }) : 'Unknown'
    const sizeMb = ((file.size || 0) / (1024 * 1024)).toFixed(2)
    const sourceIcon = getSourceIcon(file.source)
    const publicLink = file.publicLink || ''
    const publicUrl = file.shortCode
      ? buildShortUrl(file.shortCode)
      : getPublicUrl(publicLink, user.serverUrl)
    const escapedUrl = escapeTelegramHtml(publicUrl)
    responseText += `${offset + index + 1}. <b>${escapeTelegramHtml(file.fileName || 'Untitled')}</b> (${sizeMb} MB) ${sourceIcon}\n`
    responseText += `🔗 <a href="${escapedUrl}">${escapedUrl}</a>\n`
    responseText += `📅 <i>${dateStr}</i>\n\n`
  })

  const buttons = []
  if (page > 1) {
    buttons.push({ text: '⬅️ Previous', callback_data: `files:${user.id}:${page - 1}` })
  }
  if (page < pageCount) {
    buttons.push({ text: 'Next ➡️', callback_data: `files:${user.id}:${page + 1}` })
  }

  return {
    text: responseText,
    replyMarkup: buttons.length > 0 ? { inline_keyboard: [buttons] } : botMainMenu,
  }
}
