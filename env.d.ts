declare global {
  namespace NodeJS {
    interface ProcessEnv {
      NEXT_PUBLIC_SMARTERMAIL_URL: string
      SMARTERMAIL_CLIENT_ID: string
      PUBLIC_FOLDER?: string
      ENCRYPTION_KEY: string
      TELEGRAM_BOT_TOKEN: string
      TELEGRAM_BOT_USERNAME: string
      ALLOWED_TELEGRAM_USERS?: string
      TURSO_DATABASE_URL?: string
      TURSO_AUTH_TOKEN?: string
      NODE_ENV: 'development' | 'production' | 'test'
    }
  }
}

export {}
