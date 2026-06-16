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
