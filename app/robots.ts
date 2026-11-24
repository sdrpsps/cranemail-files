import type { MetadataRoute } from 'next'

import { allowIndexing, siteUrl } from '@/lib/site'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/'],
    },
    // Allow crawlers to read noindex on the dashboard and share redirects.
    sitemap: allowIndexing
      ? new URL('/sitemap.xml', siteUrl).href
      : undefined,
  }
}
