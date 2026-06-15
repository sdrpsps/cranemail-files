'use client'

import { useState } from 'react'
import type { ChangeEvent, DragEvent } from 'react'

import { TelegramBindModal } from '@/app/components/TelegramBindModal'
import { UploadDropzone } from '@/app/components/UploadDropzone'
import { UploadedImagesGrid } from '@/app/components/UploadedImagesGrid'
import type { UploadedImage, User } from '@/app/types/app'

interface UploadDashboardProps {
  user: User
  images: UploadedImage[]
  imagesLoading: boolean
  imagesError: string
  uploading: boolean
  uploadError: string
  isDragActive: boolean
  syncing: boolean
  deletingIds: Set<string>
  onLogout: () => void
  onRefreshSession: () => Promise<void>
  onSyncWorkspace: () => void
  onCopyLink: (url: string) => void
  onDeleteImage: (id: string) => void
  onDrag: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void
}

export function UploadDashboard({
  user,
  images,
  imagesLoading,
  imagesError,
  uploading,
  uploadError,
  isDragActive,
  syncing,
  deletingIds,
  onLogout,
  onRefreshSession,
  onSyncWorkspace,
  onCopyLink,
  onDeleteImage,
  onDrag,
  onDrop,
  onFileChange,
}: UploadDashboardProps) {
  const [showBindModal, setShowBindModal] = useState(false)

  const refreshBindStatus = async () => {
    await onRefreshSession()
    setShowBindModal(false)
  }

  return (
    <>
      <div className="rounded-3xl border border-zinc-800/80 bg-zinc-900/40 p-5 shadow-[0_20px_50px_rgba(0,0,0,0.5)] backdrop-blur-2xl transition-all duration-500 sm:p-6 lg:p-8">
        <header className="mb-6 flex flex-col gap-4 border-b border-zinc-800/60 pb-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 shadow-lg shadow-blue-500/20">
              <svg className="h-7 w-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">Cranemail Cloud Drive</h1>
              <p className="mt-1 text-sm text-zinc-400">Personal Cloud Image Host</p>
            </div>
          </div>

          <button
            onClick={onLogout}
            className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-zinc-700/80 bg-zinc-800/30 px-5 py-3 font-medium text-zinc-300 transition-all duration-300 hover:bg-zinc-800/80 hover:text-white active:scale-[0.98]"
          >
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
            Sign Out
          </button>
        </header>

        <div className="grid gap-4 lg:grid-cols-[minmax(260px,360px)_1fr]">
          <aside className="space-y-4">
            <div className="flex flex-col space-y-1.5 rounded-xl border border-zinc-800/40 bg-zinc-950/40 p-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Account</span>
              <span className="break-all font-medium text-zinc-200">{user.emailAddress}</span>
            </div>

            <div className="flex flex-col space-y-1.5 rounded-xl border border-zinc-800/40 bg-zinc-950/40 p-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">SmarterMail Server</span>
              <span className="select-all break-all font-mono text-sm text-blue-400">{user.serverUrl}</span>
            </div>

            <div className="flex flex-col space-y-3 rounded-xl border border-zinc-800/40 bg-zinc-950/40 p-4">
              <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Telegram Upload Integration</span>

              {user.isTelegramBound ? (
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center space-x-2 font-medium text-emerald-400">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm">Linked Successfully</span>
                  </div>
                  <button
                    onClick={() => setShowBindModal(true)}
                    className="text-xs text-zinc-400 underline transition-colors hover:text-zinc-200 focus:outline-none"
                  >
                    Re-link Account
                  </button>
                </div>
              ) : (
                <div className="flex flex-col space-y-3">
                  <div className="flex items-center space-x-2 font-medium text-amber-500">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                      />
                    </svg>
                    <span className="text-sm">Not Linked</span>
                  </div>
                  <button
                    onClick={() => setShowBindModal(true)}
                    className="w-full cursor-pointer rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-blue-500/10 transition-all hover:from-blue-500 hover:to-indigo-500 active:scale-[0.98]"
                  >
                    Link Telegram Bot
                  </button>
                </div>
              )}
            </div>

            <UploadDropzone
              uploading={uploading}
              uploadError={uploadError}
              isDragActive={isDragActive}
              onDrag={onDrag}
              onDrop={onDrop}
              onFileChange={onFileChange}
            />
          </aside>

          <UploadedImagesGrid
            images={images}
            imagesLoading={imagesLoading}
            imagesError={imagesError}
            syncing={syncing}
            deletingIds={deletingIds}
            onSyncWorkspace={onSyncWorkspace}
            onCopyLink={onCopyLink}
            onDeleteImage={onDeleteImage}
          />
        </div>
      </div>

      {showBindModal && <TelegramBindModal onClose={() => setShowBindModal(false)} onRefreshStatus={refreshBindStatus} />}
    </>
  )
}
