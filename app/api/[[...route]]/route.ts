import { getCloudflareContext } from '@opennextjs/cloudflare'
import { handleApiRequest } from '@/lib/api'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function handle(request: Request): Promise<Response> {
  const { env } = await getCloudflareContext({ async: true })
  for (const [key, value] of Object.entries(env as Record<string, unknown>)) {
    if (typeof value === 'string') {
      process.env[key] = value
    }
  }
  return handleApiRequest(request)
}

export const GET = handle
export const POST = handle
export const PUT = handle
export const PATCH = handle
export const DELETE = handle
export const HEAD = handle
export const OPTIONS = handle
