declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NEXT_PUBLIC_SITE_URL?: string
      NEXT_PUBLIC_DISABLE_INDEXING?: string
      BETTER_AUTH_SECRET?: string
      BETTER_AUTH_URL?: string
      NEXT_PUBLIC_SMARTERMAIL_URL: string
      SMARTERMAIL_CLIENT_ID: string
      PUBLIC_FOLDER?: string
      TIMEZONE?: string
      ENCRYPTION_KEY: string
      UPLOAD_MAX_BYTES?: string
      NODE_ENV: 'development' | 'production' | 'test'
    }
  }
}

export {}
