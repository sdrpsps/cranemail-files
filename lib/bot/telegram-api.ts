function getBotToken() {
  return process.env.TELEGRAM_BOT_TOKEN
}

export function hasBotToken() {
  return Boolean(getBotToken())
}

export const botMainMenu = {
  keyboard: [
    [{ text: '📂 My Files' }, { text: '❓ Help' }]
  ],
  resize_keyboard: true,
  one_time_keyboard: false
}

export async function sendTelegramMessage(chatId: number | string, text: string, replyMarkup?: Record<string, unknown>) {
  const token = getBotToken()
  if (!token) {
    console.error('TELEGRAM_BOT_TOKEN is not configured.')
    return
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: false,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      }),
    })
    if (!res.ok) {
      console.error('Telegram sendMessage error:', await res.text())
    }
  } catch (err) {
    console.error('Failed to send Telegram message:', err)
  }
}

export async function editTelegramMessageText(
  chatId: number | string,
  messageId: number,
  text: string,
  replyMarkup?: Record<string, unknown>,
) {
  const token = getBotToken()
  if (!token) {
    console.error('TELEGRAM_BOT_TOKEN is not configured.')
    return
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: false,
        ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
      }),
    })
    if (!res.ok) {
      console.error('Telegram editMessageText error:', await res.text())
    }
  } catch (err) {
    console.error('Failed to edit Telegram message:', err)
  }
}

export async function answerTelegramCallbackQuery(callbackQueryId: string) {
  const token = getBotToken()
  if (!token) {
    console.error('TELEGRAM_BOT_TOKEN is not configured.')
    return
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId }),
    })
    if (!res.ok) {
      console.error('Telegram answerCallbackQuery error:', await res.text())
    }
  } catch (err) {
    console.error('Failed to answer Telegram callback query:', err)
  }
}

export async function getTelegramFilePath(fileId: string) {
  const token = getBotToken()
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN is not configured.')
  }

  const tgFileRes = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${fileId}`)
  const tgFileInfo = await tgFileRes.json()

  if (!tgFileInfo.ok || !tgFileInfo.result?.file_path) {
    throw new Error('Failed to retrieve file location from Telegram.')
  }

  return tgFileInfo.result.file_path as string
}

export async function downloadTelegramFile(filePath: string) {
  const token = getBotToken()
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN is not configured.')
  }

  const tgDownRes = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`)
  if (!tgDownRes.ok) {
    throw new Error('Failed to download file from Telegram servers.')
  }

  return Buffer.from(await tgDownRes.arrayBuffer())
}
