'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChangeEvent, DragEvent, SetStateAction } from 'react'
import { toast } from 'sonner'

import type { UploadQueueItem, UploadedFile } from '@/app/types/app'

const FILES_CACHE_KEY = 'cranemail_files_cache_v1'

function readCachedFiles(): UploadedFile[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.sessionStorage.getItem(FILES_CACHE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as UploadedFile[]) : []
  } catch {
    return []
  }
}

function writeCachedFiles(files: UploadedFile[]) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(FILES_CACHE_KEY, JSON.stringify(files))
  } catch {
    // Ignore storage errors (e.g. quota exceeded / private mode)
  }
}

function createQueueId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function normalizeClipboardFile(file: File, index: number): File {
  const genericNames = new Set(['image.png', 'image.jpg', 'image.jpeg', 'blob'])
  if (!file.name || genericNames.has(file.name.toLowerCase())) {
    const extFromType = file.type?.split('/')[1]?.split('+')[0] || 'png'
    const safeExt = extFromType === 'jpeg' ? 'jpg' : extFromType
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
    const suffix = index > 0 ? `-${index + 1}` : ''
    return new File([file], `clipboard-${stamp}${suffix}.${safeExt}`, {
      type: file.type || 'image/png',
    })
  }
  return file
}

async function writeClipboardText(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Fallback below when Clipboard API is restricted
    }
  }

  if (typeof document === 'undefined') {
    return false
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()

  try {
    return document.execCommand('copy')
  } finally {
    document.body.removeChild(textarea)
  }
}

export function useFiles() {
  const [files, setFilesState] = useState<UploadedFile[]>([])
  const [filesLoading, setFilesLoading] = useState(false)
  const [filesError, setFilesError] = useState('')
  const [uploading, setUploading] = useState(false)
  const [uploadError, setUploadError] = useState('')
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([])
  const [isDragActive, setIsDragActive] = useState(false)
  const [deletingIds, setDeletingIds] = useState<Set<string>>(() => new Set())
  const [syncing, setSyncing] = useState(false)
  const [cleaningFolders, setCleaningFolders] = useState(false)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const dragDepthRef = useRef(0)
  const activeBatchesRef = useRef(0)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const setFiles = useCallback((action: SetStateAction<UploadedFile[]>) => {
    setFilesState((prev) => {
      const next = typeof action === 'function' ? action(prev) : action
      writeCachedFiles(next)
      return next
    })
  }, [])

  useEffect(() => {
    const cached = readCachedFiles()
    if (cached.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setFilesState(cached)
    }

    return () => {
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current)
      }
    }
  }, [])

  const fetchFiles = useCallback(async () => {
    setFilesLoading(true)
    setFilesError('')
    try {
      const res = await fetch('/api/files')
      const data = await res.json()
      if (data.success && data.data) {
        setFiles(data.data)
      } else {
        setFilesError(data.message || 'Failed to fetch uploaded files')
      }
    } catch (err) {
      setFilesError('Network error. Failed to load uploaded files.')
      console.error(err)
    } finally {
      setFilesLoading(false)
    }
  }, [setFiles])

  const uploadSingleFile = useCallback(async (file: File): Promise<UploadedFile> => {
    const formData = new FormData()
    formData.append('file', file)

    const res = await fetch('/api/upload', {
      method: 'POST',
      body: formData,
    })

    let data: {
      success?: boolean
      message?: string
      data?: {
        id: string
        fileName: string
        publicLink: string
        createdAt?: string
      }
    } = {}

    try {
      data = await res.json()
    } catch {
      throw new Error(`Upload failed (${res.status})`)
    }

    if (!res.ok || !data.success || !data.data) {
      throw new Error(data.message || 'Upload failed. Please try again.')
    }

    return {
      id: data.data.id,
      fileName: data.data.fileName,
      publicLink: data.data.publicLink,
      size: file.size,
      source: 'web',
      createdAt: data.data.createdAt || new Date().toISOString(),
    }
  }, [])

  const uploadFiles = useCallback(
    async (fileInput: FileList | File[]) => {
      const incoming = Array.from(fileInput).filter((file) => file.size >= 0)
      if (incoming.length === 0) {
        return
      }

      const queuedBatch = incoming.map((file) => ({
        file,
        item: {
          id: createQueueId(),
          fileName: file.name || `upload-${Date.now()}`,
          size: file.size,
          status: 'uploading' as const,
        },
      }))

      activeBatchesRef.current += 1
      setUploading(true)
      setUploadError('')
      setUploadQueue((prev) => [
        ...queuedBatch.map((entry) => entry.item),
        ...prev.slice(0, 12),
      ])

      let successCount = 0
      let failureCount = 0
      let lastErrorMessage = ''

      try {
        for (const { file, item } of queuedBatch) {
          try {
            const uploaded = await uploadSingleFile(file)
            successCount += 1
            setFiles((prev) => [uploaded, ...prev])
            setUploadQueue((prev) =>
              prev.map((q) =>
                q.id === item.id
                  ? {
                      ...q,
                      fileName: uploaded.fileName,
                      status: 'done',
                      publicLink: uploaded.publicLink,
                    }
                  : q,
              ),
            )
          } catch (err) {
            failureCount += 1
            const message =
              err instanceof Error
                ? err.message
                : 'Failed to upload file due to a connection error.'
            lastErrorMessage = message
            setUploadError(message)
            setUploadQueue((prev) =>
              prev.map((q) =>
                q.id === item.id ? { ...q, status: 'error', error: message } : q,
              ),
            )
            console.error(err)
          }
        }

        if (successCount > 0 && failureCount === 0) {
          toast.success(
            successCount === 1
              ? 'File uploaded to CraneMail workspace'
              : `${successCount} files uploaded to CraneMail workspace`,
          )
        } else if (successCount > 0 && failureCount > 0) {
          toast.warning(
            `Uploaded ${successCount} file(s), ${failureCount} failed`,
          )
        } else if (failureCount > 0) {
          toast.error(lastErrorMessage || 'Upload failed')
        }
      } finally {
        activeBatchesRef.current = Math.max(0, activeBatchesRef.current - 1)
        if (activeBatchesRef.current === 0) {
          setUploading(false)
        }
      }
    },
    [setFiles, uploadSingleFile],
  )

  const clearUploadQueue = useCallback(() => {
    setUploadQueue((prev) => prev.filter((item) => item.status === 'uploading'))
  }, [])

  const syncWorkspace = useCallback(async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/files/sync', {
        method: 'POST',
      })
      const data = await res.json()
      if (data.success && data.data) {
        const count = data.data.syncedCount
        toast.success(`Synced ${count} new file(s) from workspace`)
        fetchFiles()
      } else {
        toast.error(data.message || 'Sync failed. Please try again.')
      }
    } catch (err) {
      toast.error('Network error during sync.')
      console.error(err)
    } finally {
      setSyncing(false)
    }
  }, [fetchFiles])

  const cleanupEmptyFolders = useCallback(async () => {
    setCleaningFolders(true)
    try {
      const res = await fetch('/api/files/cleanup-folders', {
        method: 'POST',
      })
      const data = await res.json()
      if (data.success && data.data) {
        const count = Number(data.data.deletedCount) || 0
        if (count > 0) {
          toast.success(
            `Removed ${count} empty date ${count === 1 ? 'folder' : 'folders'}`,
          )
        } else {
          toast.info('No empty date folders found')
        }
      } else {
        toast.error(data.message || 'Failed to clean empty folders')
      }
    } catch (err) {
      toast.error('Network error while cleaning empty folders.')
      console.error(err)
    } finally {
      setCleaningFolders(false)
    }
  }, [])

  const deleteFile = useCallback(async (id: string) => {
    setDeletingIds((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })

    try {
      const res = await fetch(`/api/files/${id}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (data.success) {
        setFiles((prev) => prev.filter((file) => file.id !== id))
        toast.success('File deleted from workspace')
      } else {
        toast.error(data.message || 'Failed to delete the file record')
      }
    } catch (err) {
      toast.error('Connection error. Failed to delete file.')
      console.error(err)
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }, [setFiles])

  const copyText = useCallback(
    async (text: string, key?: string, toastMessage = 'Copied to clipboard') => {
      const ok = await writeClipboardText(text)
      if (!ok) {
        toast.error('Unable to copy to clipboard')
        return
      }

      const activeKey = key ?? text
      setCopiedKey(activeKey)
      if (copyTimerRef.current) {
        clearTimeout(copyTimerRef.current)
      }
      copyTimerRef.current = setTimeout(() => {
        setCopiedKey((current) => (current === activeKey ? null : current))
      }, 2000)

      toast.success(toastMessage)
    },
    [],
  )

  const copyLink = useCallback(
    async (url: string, label?: string, key?: string) => {
      await copyText(url, key ?? url, label || 'Direct link copied to clipboard')
    },
    [copyText],
  )

  const handleDrag = useCallback((e: DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter') {
      dragDepthRef.current += 1
      setIsDragActive(true)
    } else if (e.type === 'dragover') {
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = 'copy'
      }
      setIsDragActive(true)
    } else if (e.type === 'dragleave') {
      dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)
      if (dragDepthRef.current === 0) {
        setIsDragActive(false)
      }
    }
  }, [])

  const handleDrop = useCallback(
    async (e: DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      dragDepthRef.current = 0
      setIsDragActive(false)

      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        await uploadFiles(e.dataTransfer.files)
      }
    },
    [uploadFiles],
  )

  const handleFileChange = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        await uploadFiles(e.target.files)
      }
      e.target.value = ''
    },
    [uploadFiles],
  )

  const handlePasteFiles = useCallback(
    async (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }

      const rawFiles = Array.from(e.clipboardData?.files ?? [])
      if (rawFiles.length === 0) {
        return
      }

      e.preventDefault()
      const normalized = rawFiles.map((file, index) =>
        normalizeClipboardFile(file, index),
      )
      await uploadFiles(normalized)
    },
    [uploadFiles],
  )

  return {
    files,
    filesLoading,
    filesError,
    uploading,
    uploadError,
    uploadQueue,
    isDragActive,
    deletingIds,
    syncing,
    cleaningFolders,
    copiedKey,
    fetchFiles,
    uploadFiles,
    clearUploadQueue,
    syncWorkspace,
    cleanupEmptyFolders,
    deleteFile,
    copyText,
    copyLink,
    handleDrag,
    handleDrop,
    handleFileChange,
    handlePasteFiles,
    setFiles,
  }
}
