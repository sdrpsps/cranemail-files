import { and, count, desc, eq, sql } from 'drizzle-orm'
import { db, uploadedFiles, type UploadedFileRecord } from '../db'
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

function getFileUrl(file: Pick<UploadedFileRecord, 'shortCode' | 'publicLink'>, user: UserRow) {
  return file.shortCode ? buildShortUrl(file.shortCode) : getPublicUrl(file.publicLink || '', user.serverUrl)
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
    const escapedUrl = escapeTelegramHtml(getFileUrl(file, user))
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

export async function renderFileSearch(user: UserRow, query: string) {
  const matches = await db
    .select({ fileName: uploadedFiles.fileName, publicLink: uploadedFiles.publicLink, shortCode: uploadedFiles.shortCode })
    .from(uploadedFiles)
    .where(and(
      eq(uploadedFiles.email, user.email),
      sql`instr(lower(${uploadedFiles.fileName}), lower(${query})) > 0`,
    ))
    .orderBy(desc(uploadedFiles.createdAt), desc(uploadedFiles.id))
    .limit(BOT_FILES_PER_PAGE + 1)

  const account = `👤 <code>${escapeTelegramHtml(user.email)}</code>`
  if (!matches.length) return `${account}\n🔎 No matching files. Try a different part of the filename.`

  const lines = matches.slice(0, BOT_FILES_PER_PAGE).map((file) => {
    const name = escapeTelegramHtml(file.fileName || 'Untitled')
    const url = getFileUrl(file, user)
    return url ? `• <a href="${escapeTelegramHtml(url)}">${name}</a>` : `• ${name}`
  })
  if (matches.length > BOT_FILES_PER_PAGE) {
    lines.push('', `Showing the ${BOT_FILES_PER_PAGE} most recent matches. Use a more specific filename to narrow the results.`)
  }
  return [account, '🔎 <b>Matching files</b>', '', ...lines].join('\n')
}
