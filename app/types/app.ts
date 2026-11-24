export interface User {
  username: string
  emailAddress: string
  serverUrl: string
  isTelegramBound: boolean
}

export interface BindData {
  token: string
  bindUrl: string
}

export interface UploadedFile {
  id: string
  fileName: string
  publicLink: string
  size: number
  source: string
  createdAt: string
}

export interface UploadQueueItem {
  id: string
  fileName: string
  size: number
  status: 'uploading' | 'done' | 'error'
  publicLink?: string
  error?: string
}

export type FileSourceFilter = 'all' | 'web' | 'telegram' | 'workspace'

export type FileTypeFilter = 'all' | 'image' | 'document'

export type FileViewMode = 'grid' | 'list'
