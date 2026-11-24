import type { MetadataRoute } from 'next'

import { allowIndexing, siteUrl } from '@/lib/site'

export default function sitemap(): MetadataRoute.Sitemap {
  // Only the public entry page belongs here, never users' files or dashboards.
  return allowIndexing ? [{ url: siteUrl.href }] : []
}
