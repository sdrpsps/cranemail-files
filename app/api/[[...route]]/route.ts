import { Hono } from 'hono'
import { handle } from 'hono/vercel'
import { HTTPException } from 'hono/http-exception'
import { apiError } from '@/lib/response'
import { ensureDbInitialized } from '@/lib/db'
import authApp from './_routes/auth'
import uploadApp from './_routes/upload'
import filesApp from './_routes/files'
import telegramApp from './_routes/telegram'

// Initialize Hono app. Setting the basePath allows matching subroutes correctly.
const app = new Hono().basePath('/api')

app.use('*', async (_c, next) => {
  await ensureDbInitialized()
  await next()
})

// Global 404 Not Found Handler
app.notFound((c) => {
  return apiError(c, `Route not found: ${c.req.method} ${c.req.path}`, 404)
})

// Global Error Handler
app.onError((err, c) => {
  // Log the error locally for server-side monitoring
  console.error(`[API Error Log] ${c.req.method} ${c.req.path}:`, err)

  // Handle standard Hono HTTP Exceptions (e.g., manually thrown or from Hono middleware)
  if (err instanceof HTTPException) {
    return apiError(c, err.message, err.status)
  }

  // Handle general/unexpected runtime errors
  const isDev = process.env.NODE_ENV === 'development'
  const errorMessage = err.message || 'An unexpected error occurred'

  return apiError(
    c,
    isDev ? errorMessage : 'Internal Server Error',
    500,
    isDev ? { stack: err.stack } : undefined
  )
})

// Mount feature routes
app.route('/auth', authApp)
app.route('/upload', uploadApp)
app.route('/files', filesApp)
app.route('/telegram', telegramApp)

// Export HTTP method handlers to be consumed by Next.js App Router
export const GET = handle(app)
export const POST = handle(app)
export const PUT = handle(app)
export const DELETE = handle(app)
export const PATCH = handle(app)
export const OPTIONS = handle(app)
