'use client'

import type { ChangeEvent, DragEvent } from 'react'
import { LoaderCircle, UploadCloud } from 'lucide-react'

import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

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
    <Card className="space-y-3 border-zinc-800/80 bg-zinc-950/65 p-4 py-4 text-zinc-100 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">Web Direct Upload</span>

      <div
        onDragEnter={onDrag}
        onDragOver={onDrag}
        onDragLeave={onDrag}
        onDrop={onDrop}
        className={`relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-all ${
          isDragActive ? 'border-blue-500 bg-blue-500/10 shadow-[0_0_0_1px_rgba(59,130,246,0.14)]' : 'border-zinc-800 bg-zinc-950/70 hover:border-zinc-700 hover:bg-zinc-950/90'
        }`}
      >
        <Input
          type="file"
          id="web-file-input"
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          onChange={onFileChange}
          disabled={uploading}
          accept="image/jpeg,image/png,image/gif,image/webp"
        />

        {uploading ? (
          <div className="flex flex-col items-center space-y-2">
            <LoaderCircle className="h-8 w-8 animate-spin text-blue-500" />
            <span className="text-xs text-zinc-400">Uploading to cloud drive...</span>
          </div>
        ) : (
          <div className="flex flex-col items-center space-y-2">
            <UploadCloud className="h-8 w-8 text-zinc-500" />
            <span className="text-xs font-medium text-zinc-300">Drag & drop image here or click to browse</span>
            <span className="text-[10px] text-zinc-500">Supports JPG, PNG, GIF, WebP up to 10MB</span>
          </div>
        )}
      </div>

      {uploadError && <p className="text-xs text-red-400">{uploadError}</p>}
    </Card>
  )
}
