import nextWorker from '../.open-next/worker.js'
import { runWithCloudflareRequestContext } from '../.open-next/cloudflare/init.js'
import { handleApiRequest } from './api'

const worker = {
  fetch(request, env, context) {
    const { pathname } = new URL(request.url)
    if (pathname === '/api' || pathname.startsWith('/api/')) {
      return runWithCloudflareRequestContext(request, env, context, () => handleApiRequest(request))
    }
    return nextWorker.fetch(request, env, context)
  },
}

export default worker
