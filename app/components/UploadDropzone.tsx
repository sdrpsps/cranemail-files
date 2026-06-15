'use client'

import type { ChangeEvent, DragEvent } from 'react'

interface UploadDropzoneProps {
  uploading: boolean
  uploadError: string
  isDragActive: boolean
  onDrag: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
  onFileChange: (e: ChangeEvent<HTMLInputElement>) => void
}

export function UploadDropzone({
  uploading,
  uploadError,
  isDragActive,
  onDrag,
  onDrop,
  onFileChange,
}: UploadDropzoneProps) {
  return (
    <div className="space-y-3 rounded-xl border border-zinc-800/40 bg-zinc-950/40 p-4">
      <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Web Direct Upload</span>

      <div
        onDragEnter={onDrag}
        onDragOver={onDrag}
        onDragLeave={onDrag}
        onDrop={onDrop}
        className={`relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-all ${
          isDragActive ? 'border-blue-500 bg-blue-500/5' : 'border-zinc-800 bg-zinc-900/10 hover:border-zinc-700'
        }`}
      >
        <input
          type="file"
          id="web-file-input"
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          onChange={onFileChange}
          disabled={uploading}
          accept="image/jpeg,image/png,image/gif,image/webp"
        />

        {uploading ? (
          <div className="flex flex-col items-center space-y-2">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500/30 border-t-blue-500" />
            <span className="text-xs text-zinc-400">Uploading to cloud drive...</span>
          </div>
        ) : (
          <div className="flex flex-col items-center space-y-2">
            <svg className="h-8 w-8 text-zinc-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
            <span className="text-xs font-medium text-zinc-300">Drag & drop image here or click to browse</span>
            <span className="text-[10px] text-zinc-500">Supports JPG, PNG, GIF, WebP up to 10MB</span>
          </div>
        )}
      </div>

      {uploadError && <p className="text-xs text-red-400">{uploadError}</p>}
    </div>
  )
}
