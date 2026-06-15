import { Context } from 'hono'

export interface ApiResponse<T = any> {
  success: boolean
  code: number
  message: string
  data: T | null
  errors?: any
  timestamp: string
}

/**
 * Returns a standardized success response.
 * @param c Hono Context
 * @param data The payload to return
 * @param message Success message (default: 'Success')
 * @param status HTTP status code (default: 200)
 */
export function apiSuccess<T>(
  c: Context,
  data: T,
  message: string = 'Success',
  status: number = 200
) {
  const responseBody: ApiResponse<T> = {
    success: true,
    code: status,
    message,
    data,
    timestamp: new Date().toISOString(),
  }
  return c.json(responseBody, status as any)
}

/**
 * Returns a standardized error response.
 * @param c Hono Context
 * @param message Error message
 * @param status HTTP status code (default: 400)
 * @param errors Additional details or structured errors (e.g. validation issues)
 */
export function apiError(
  c: Context,
  message: string,
  status: number = 400,
  errors?: any
) {
  const responseBody: ApiResponse<null> = {
    success: false,
    code: status,
    message,
    data: null,
    errors,
    timestamp: new Date().toISOString(),
  }
  return c.json(responseBody, status as any)
}
