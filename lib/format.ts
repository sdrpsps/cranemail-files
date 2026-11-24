/**
 * Formatting and URL helpers for CraneMail Files UI.
 */

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '0 B'
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  if (unitIndex === 0) {
    return `${Math.round(value)} B`
  }

  const decimals = value >= 100 ? 0 : value >= 10 ? 1 : 2
  return `${value.toFixed(decimals)} ${units[unitIndex]}`
}

export function formatTimestamp(isoString?: string): string {
  if (!isoString) {
    return '—'
  }

  const cleanIso =
    isoString.includes(' ') && !isoString.includes('T')
      ? `${isoString.replace(' ', 'T')}Z`
      : isoString

  const date = new Date(cleanIso)
  if (Number.isNaN(date.getTime())) {
    return isoString
  }

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  return `${year}-${month}-${day} ${hours}:${minutes}`
}

export function getPublicUrl(publicLink: string, serverUrl?: string): string {
  if (!publicLink) {
    return ''
  }

  if (/^https?:\/\//i.test(publicLink)) {
    return publicLink
  }

  const baseUrl = serverUrl || process.env.NEXT_PUBLIC_SMARTERMAIL_URL
  if (!baseUrl) {
    return publicLink
  }

  return `${baseUrl.replace(/\/+$/, '')}/${publicLink.replace(/^\/+/, '')}`
}

export function isImageFile(fileName: string): boolean {
  return /\.(jpg|jpeg|png|gif|webp|svg|avif|bmp)$/i.test(fileName)
}

export function getFileExtension(fileName: string): string {
  const trimmed = fileName.trim()
  const lastDot = trimmed.lastIndexOf('.')
  if (lastDot <= 0 || lastDot === trimmed.length - 1) {
    return 'FILE'
  }

  const ext = trimmed.slice(lastDot + 1).toUpperCase()
  return ext.length > 6 ? ext.slice(0, 6) : ext
}

export function extractHostname(url: string): string {
  if (!url) {
    return 'workspace'
  }

  try {
    const parsed = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`)
    return parsed.host || url
  } catch {
    return url.replace(/^https?:\/\//i, '').replace(/\/+$/, '') || 'workspace'
  }
}
