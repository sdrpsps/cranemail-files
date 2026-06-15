import { Hono } from 'hono'
import { handle } from 'hono/vercel'
import { HTTPException } from 'hono/http-exception'
import { apiSuccess, apiError } from '@/lib/response'

// Initialize Hono app. Setting the basePath allows matching subroutes correctly.
const app = new Hono().basePath('/api')

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

// Sample Route 1: Hello World
app.get('/hello', (c) => {
  return apiSuccess(c, { greeting: 'Hello from Hono!' }, 'Hello endpoint fetched successfully')
})

// Sample Route 2: Fetch Data
app.get('/users', (c) => {
  const users = [
    { id: 1, name: 'Alice', email: 'alice@example.com' },
    { id: 2, name: 'Bob', email: 'bob@example.com' },
  ]
  return apiSuccess(c, users, 'Users list retrieved successfully')
})

// Sample Route 3: Test Error Handler
app.get('/error-test', (c) => {
  throw new Error('This is a simulated runtime exception to test global error handling')
})

// Export HTTP method handlers to be consumed by Next.js App Router
export const GET = handle(app)
export const POST = handle(app)
export const PUT = handle(app)
export const DELETE = handle(app)
export const PATCH = handle(app)
export const OPTIONS = handle(app)
