import { db } from '../db'
import { botMainMenu } from './telegram-api'
import type { UploadedFileRow, UserRow } from './types'

const BOT_FILES_PER_PAGE = 6

function getSourceIcon(source?: string | null) {
  if (source === 'telegram') return '🤖'
  if (source === 'workspace') return '💼'
  return '💻'
}

function getCountValue(value: unknown) {
  if (typeof value === 'number') return value
  if (typeof value === 'bigint') return Number(value)
  if (typeof value === 'string') return Number(value) || 0
  return 0
}

export function getRequestedFilesPage(text: string) {
  const match = text.match(/^\/(?:files|list)(?:@\w+)?(?:\s+(\d+))?$/i)
  if (!match?.[1]) return 1

  const page = Number.parseInt(match[1], 10)
  return Number.isFinite(page) && page > 0 ? page : 1
}

export async function renderFilesList(user: UserRow, requestedPage: number) {
  const countRes = await db.execute({
    sql: 'SELECT COUNT(*) AS total FROM uploaded_files WHERE email = ?',
    args: [user.email],
  })
  const total = getCountValue(countRes.rows[0]?.total)

  if (total === 0) {
    return {
      text: '📂 <b>No uploaded files found.</b>\nSend me a file to start uploading!',
      replyMarkup: botMainMenu,
    }
  }

  const pageCount = Math.max(1, Math.ceil(total / BOT_FILES_PER_PAGE))
  const page = Math.min(Math.max(1, requestedPage), pageCount)
  const offset = (page - 1) * BOT_FILES_PER_PAGE
  const filesRes = await db.execute({
    sql: 'SELECT * FROM uploaded_files WHERE email = ? ORDER BY createdAt DESC LIMIT ? OFFSET ?',
    args: [user.email, BOT_FILES_PER_PAGE, offset],
  })

  let responseText = `📂 <b>Your Uploaded Files</b> (${page}/${pageCount}, ${total} total)\n\n`
  filesRes.rows.forEach((row, index) => {
    const file = row as unknown as UploadedFileRow
    const dateStr = file.createdAt ? new Date(file.createdAt).toLocaleString('zh-CN', { timeZone: process.env.TIMEZONE || 'Asia/Shanghai' }) : 'Unknown'
    const sizeMb = ((file.size || 0) / (1024 * 1024)).toFixed(2)
    const sourceIcon = getSourceIcon(file.source)
    const publicLink = file.publicLink || ''
    const publicUrl = `${user.serverUrl}/${publicLink}`
    responseText += `${offset + index + 1}. <b>${file.fileName || 'Untitled'}</b> (${sizeMb} MB) ${sourceIcon}\n`
    responseText += `🔗 <a href="${publicUrl}">${publicUrl}</a>\n`
    responseText += `📅 <i>${dateStr}</i>\n\n`
  })

  const buttons = []
  if (page > 1) {
    buttons.push({ text: '⬅️ Previous', callback_data: `files:${page - 1}` })
  }
  if (page < pageCount) {
    buttons.push({ text: 'Next ➡️', callback_data: `files:${page + 1}` })
  }

  return {
    text: responseText,
    replyMarkup: buttons.length > 0 ? { inline_keyboard: [buttons] } : botMainMenu,
  }
}
