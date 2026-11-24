import { ensureDbInitialized } from '@/lib/db'
import { getPublicUrl } from '@/lib/format'
import { isValidShortCode, resolveShortCode } from '@/lib/shortlink'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
): Promise<Response> {
  const { code } = await params
  const notFound = () => new Response('Not found', {
    status: 404,
    headers: { 'Cache-Control': 'no-store' },
  })
  if (!isValidShortCode(code)) return notFound()

  await ensureDbInitialized()
  const publicLink = await resolveShortCode(code)
  if (!publicLink) return notFound()

  let destination: URL
  try {
    destination = new URL(getPublicUrl(publicLink))
  } catch {
    return notFound()
  }
  if (destination.protocol !== 'http:' && destination.protocol !== 'https:') {
    return notFound()
  }

  return new Response(null, {
    status: 302,
    headers: {
      Location: destination.href,
      'Cache-Control': 'public, max-age=60, s-maxage=300',
    },
  })
}
