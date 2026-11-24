import type { Metadata } from 'next'

const configuredUrl = new URL(
  process.env.NEXT_PUBLIC_SITE_URL?.trim() || 'http://localhost:3000',
)

if (!['http:', 'https:'].includes(configuredUrl.protocol)) {
  throw new Error('NEXT_PUBLIC_SITE_URL must be an absolute HTTP or HTTPS URL.')
}

// The application is served at the domain root. Keep tracking parameters and
// accidental paths out of canonical URLs, social cards, and the sitemap.
export const siteUrl = new URL(configuredUrl.origin)

const isLocalhost = ['localhost', '127.0.0.1', '[::1]'].includes(siteUrl.hostname)
const isPreview = Boolean(
  process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production',
)

export const allowIndexing = !isLocalhost && !isPreview

export const site = {
  name: 'CraneMail Files',
  title: 'CraneMail Files — Simple file sharing for your workspace',
  description:
    'Upload photos and files to your CraneMail workspace, copy short links or Markdown, and share from your browser or Telegram. Self-host on your own domain.',
  image: {
    url: '/brand/social-card.png',
    width: 1200,
    height: 630,
    alt: 'CraneMail Files — Your files. One simple link. Share from your browser or Telegram.',
  },
}

export const siteMetadata = {
  metadataBase: siteUrl,
  applicationName: site.name,
  title: {
    default: site.title,
    template: `%s | ${site.name}`,
  },
  description: site.description,
  category: 'technology',
  keywords: [
    'CraneMail Files',
    'CraneMail',
    'file sharing',
    'image sharing',
    'short links',
    'Telegram file upload',
    'self-hosted file sharing',
  ],
  icons: {
    icon: [{ url: '/brand/crane.svg', type: 'image/svg+xml', sizes: 'any' }],
    apple: [
      { url: '/brand/apple-touch-icon.png', type: 'image/png', sizes: '180x180' },
    ],
  },
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/',
    siteName: site.name,
    title: site.title,
    description: site.description,
    images: [site.image],
  },
  twitter: {
    card: 'summary_large_image',
    title: site.title,
    description: site.description,
    images: [{ url: site.image.url, alt: site.image.alt }],
  },
  robots: {
    index: allowIndexing,
    follow: allowIndexing,
    googleBot: {
      index: allowIndexing,
      follow: allowIndexing,
      'max-image-preview': 'large',
      'max-snippet': -1,
      'max-video-preview': -1,
    },
  },
} satisfies Metadata
