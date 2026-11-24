import crypto from 'crypto'

import { getPublicUrl } from '../format'
import { buildShortUrl, insertFileWithShortCode } from '../shortlink'
import { SmarterMailClient } from '../smartermail'
import { getSmarterMailAuthForUser } from '../smartermail-session'
import {
  botMainMenu,
  downloadTelegramFile,
  escapeTelegramHtml,
  getTelegramFilePath,
  sendTelegramMessage,
} from './telegram-api'
import type { TelegramMessage } from './types'
import { getTelegramBoundUser } from './users'

export function getMessageFile(message: TelegramMessage) {
  if (message.photo && message.photo.length > 0) {
    const photo = message.photo[message.photo.length - 1]
    return {
      fileId: photo.file_id,
      fileName: `photo_${Date.now()}.jpg`,
    }
  }

  if (message.document) {
    return {
      fileId: message.document.file_id,
      fileName: message.document.file_name || `file_${Date.now()}`,
    }
  }

  return null
}

export async function handleFileUpload(chatId: number, fromId: number, fileId: string, fileName: string) {
  try {
    const user = await getTelegramBoundUser(fromId)
    if (!user) {
      await sendTelegramMessage(
        chatId,
        '❌ <b>Upload Blocked:</b>\nYour Telegram account is not bound to a CraneMail account. Please sign in to the website and click <b>"Link Telegram Bot"</b> first.'
      )
      return
    }

    await sendTelegramMessage(chatId, '⚡ <i>Uploading to CraneMail Cloud Storage...</i>')

    const { client, accessToken, user: sessionUser } = await getSmarterMailAuthForUser(user.id)
    const filePath = await getTelegramFilePath(fileId)
    const fileBuffer = await downloadTelegramFile(filePath)
    const folderPath = SmarterMailClient.getPublicFolder() + SmarterMailClient.getDatePath()

    const uploadResult = await client.uploadFile(accessToken, fileBuffer, fileName, folderPath)
    if (!uploadResult.success || !uploadResult.uploadData) {
      throw new Error(uploadResult.message || 'SmarterMail upload failed.')
    }

    const fileMeta = uploadResult.uploadData[fileName]
    if (!fileMeta || !fileMeta.id) {
      throw new Error('SmarterMail uploaded file metadata missing.')
    }

    const linkResult = await client.generatePublicLink(accessToken, fileMeta.id)
    if (!linkResult.success || !linkResult.publicLink) {
      throw new Error(linkResult.message || 'Failed to generate public download link.')
    }

    const fileRecordId = crypto.randomUUID()
    const createdAt = new Date().toISOString()
    const publicUrl = getPublicUrl(linkResult.publicLink, sessionUser.serverUrl)
    const shortCode = await insertFileWithShortCode({
      id: fileRecordId,
      email: sessionUser.email,
      fileId: fileMeta.id,
      fileName,
      publicLink: publicUrl,
      size: fileBuffer.length,
      source: 'telegram',
      createdAt,
    })

    await sendTelegramMessage(
      chatId,
      `✅ <b>File Uploaded Successfully!</b>\n\n` +
      `<b>Name:</b> <code>${escapeTelegramHtml(fileName)}</code>\n` +
      `<b>Link:</b> <code>${escapeTelegramHtml(buildShortUrl(shortCode))}</code>\n` +
      `<b>Original link:</b> <code>${escapeTelegramHtml(publicUrl)}</code>`,
      botMainMenu
    )
  } catch (err) {
    console.error('Telegram bot file upload error:', err)
    const errorMessage = err instanceof Error ? err.message : 'An unexpected error occurred during upload.'
    await sendTelegramMessage(
      chatId,
      `❌ <b>Upload Failed:</b>\n${errorMessage}`,
      botMainMenu
    )
  }
}
