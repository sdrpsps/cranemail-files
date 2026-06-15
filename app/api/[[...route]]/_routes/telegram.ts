import { Hono } from 'hono'
import { handleTelegramUpdate } from '@/lib/bot'

const telegramApp = new Hono()

// POST /webhook
telegramApp.post('/webhook', async (c) => {
  try {
    const update = await c.req.json()
    // Process update asynchronously or wait
    await handleTelegramUpdate(update)
    return c.json({ ok: true })
  } catch (err) {
    console.error('Telegram webhook error:', err)
    // Always return OK 200 to Telegram to prevent retry loop
    return c.json({ ok: true })
  }
})

export default telegramApp
