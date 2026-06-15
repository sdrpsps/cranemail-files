'use client'

import Image from 'next/image'

import type { UploadedImage } from '@/app/types/app'

interface UploadedImagesGridProps {
  images: UploadedImage[]
  imagesLoading: boolean
  imagesError: string
  syncing: boolean
  deletingIds: Set<string>
  onSyncWorkspace: () => void
  onCopyLink: (url: string) => void
  onDeleteImage: (id: string) => void
}

function formatSize(bytes: number) {
  if (!bytes) return '0 B'
  const mb = bytes / (1024 * 1024)
  if (mb >= 0.1) return `${mb.toFixed(2)} MB`
  const kb = bytes / 1024
  return `${kb.toFixed(1)} KB`
}

function formatDate(isoString?: string) {
  if (!isoString) return ''
  try {
    const cleanIso = isoString.includes(' ') && !isoString.includes('T') ? `${isoString.replace(' ', 'T')}Z` : isoString
    const d = new Date(cleanIso)
    return d.toLocaleDateString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return isoString
  }
}

function getPublicUrl(publicLink: string) {
  if (/^https?:\/\//i.test(publicLink)) return publicLink

  const baseUrl = process.env.NEXT_PUBLIC_SMARTERMAIL_URL
  if (!baseUrl) return publicLink

  return `${baseUrl.replace(/\/$/, '')}/${publicLink.replace(/^\//, '')}`
}

function isPreviewable(fileName: string) {
  return /\.(jpg|jpeg|png|gif|webp)$/i.test(fileName)
}

function SourceBadge({ source }: { source: string }) {
  const styles =
    source === 'telegram'
      ? 'border-sky-500/20 bg-sky-500/10 text-sky-400'
      : source === 'workspace'
        ? 'border-purple-500/20 bg-purple-500/10 text-purple-400'
        : 'border-blue-500/20 bg-blue-500/10 text-blue-400'

  const label = source === 'telegram' ? 'Bot' : source === 'workspace' ? 'Workspace' : 'Web'

  return (
    <span className={`rounded border px-1.5 py-0.5 text-[9px] font-semibold ${styles}`}>
      {label}
    </span>
  )
}

export function UploadedImagesGrid({
  images,
  imagesLoading,
  imagesError,
  syncing,
  deletingIds,
  onSyncWorkspace,
  onCopyLink,
  onDeleteImage,
}: UploadedImagesGridProps) {
  return (
    <section className="space-y-3 rounded-xl border border-zinc-800/40 bg-zinc-950/40 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Uploaded History ({images.length})</p>
        <div className="flex items-center space-x-2">
          <button
            onClick={onSyncWorkspace}
            disabled={syncing || imagesLoading}
            className="flex cursor-pointer select-none items-center space-x-1 rounded-lg border border-zinc-800 bg-zinc-950/60 px-2.5 py-1 text-[10px] font-medium text-zinc-300 transition-all hover:bg-zinc-900 hover:text-white disabled:opacity-50"
            title="Sync existing images from your SmarterMail storage folders"
          >
            {syncing ? (
              <>
                <div className="h-3 w-3 animate-spin rounded-full border-2 border-purple-500/30 border-t-purple-500" />
                <span>Syncing...</span>
              </>
            ) : (
              <>
                <svg className="h-3 w-3 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M9 11l3 3L21 4"
                  />
                </svg>
                <span>Sync Workspace</span>
              </>
            )}
          </button>
          {imagesLoading && !syncing && <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500/30 border-t-blue-500" />}
        </div>
      </div>

      {imagesError && <p className="text-xs text-red-400">{imagesError}</p>}

      {images.length > 0 ? (
        <div className="grid max-h-[520px] grid-cols-[repeat(auto-fit,minmax(260px,1fr))] gap-3 overflow-y-auto pr-1">
          {images.map((image) => {
            const publicUrl = getPublicUrl(image.publicLink)

            return (
              <article
                key={image.id}
                className="flex min-w-0 flex-col gap-3 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3 text-xs transition-all duration-200 hover:border-zinc-700"
              >
                <div className="flex min-w-0 items-center gap-3">
                  {isPreviewable(image.fileName) ? (
                    <Image
                      src={publicUrl}
                      alt={image.fileName}
                      width={64}
                      height={64}
                      className="h-16 w-16 flex-shrink-0 cursor-zoom-in rounded-lg border border-zinc-800 bg-zinc-950 object-cover transition-transform duration-200 hover:scale-105"
                      onClick={() => window.open(publicUrl, '_blank')}
                    />
                  ) : (
                    <div className="flex h-16 w-16 flex-shrink-0 items-center justify-center rounded-lg border border-zinc-800 bg-zinc-950">
                      <svg className="h-5 w-5 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                        />
                      </svg>
                    </div>
                  )}

                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="truncate font-medium text-zinc-200" title={image.fileName}>
                      {image.fileName}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[10px] text-zinc-500">{formatSize(image.size)}</span>
                      <span className="font-mono text-[10px] text-zinc-500">{formatDate(image.createdAt)}</span>
                      <SourceBadge source={image.source} />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-end space-x-1">
                  <a
                    href={publicUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-1.5 text-zinc-400 transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-zinc-100"
                    title="Open Link"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                  <button
                    onClick={() => onCopyLink(image.publicLink)}
                    className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-1.5 text-zinc-400 transition-all hover:border-zinc-700 hover:bg-zinc-800 hover:text-blue-400"
                    title="Copy Direct Link"
                  >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
                      />
                    </svg>
                  </button>
                  <button
                    onClick={() => onDeleteImage(image.id)}
                    disabled={deletingIds.has(image.id)}
                    className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-1.5 text-zinc-400 transition-all hover:border-red-900/40 hover:bg-red-950/40 hover:text-red-400 disabled:opacity-50"
                    title="Delete Record"
                  >
                    {deletingIds.has(image.id) ? (
                      <div className="h-4 w-4 animate-spin rounded-full border-2 border-red-500/30 border-t-red-500" />
                    ) : (
                      <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    )}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-zinc-800 bg-zinc-950/20 py-6 text-center">
          <svg className="mb-2 h-7 w-7 text-zinc-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
            />
          </svg>
          <p className="text-[11px] text-zinc-500">No images uploaded yet.</p>
          <p className="mt-0.5 text-[9px] text-zinc-600">Drag & drop files above to start.</p>
        </div>
      )}
    </section>
  )
}
