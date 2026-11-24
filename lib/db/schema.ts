import { sql } from 'drizzle-orm'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').unique(),
  serverUrl: text('serverUrl'),
  telegramUserId: text('telegramUserId').unique(),
  encryptedPassword: text('encryptedPassword'),
  createdAt: text('createdAt').default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text('updatedAt').default(sql`(CURRENT_TIMESTAMP)`),
})

export const bindTokens = sqliteTable('bind_tokens', {
  token: text('token').primaryKey(),
  userId: text('userId').notNull(),
  expiresAt: text('expiresAt'),
  createdAt: text('createdAt').default(sql`(CURRENT_TIMESTAMP)`),
})

export const appSessions = sqliteTable('app_sessions', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  expiresAt: text('expiresAt').notNull(),
  createdAt: text('createdAt').default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text('updatedAt').default(sql`(CURRENT_TIMESTAMP)`),
})

export const smartermailSessions = sqliteTable('smartermail_sessions', {
  userId: text('userId').primaryKey(),
  accessToken: text('accessToken'),
  accessTokenExpires: text('accessTokenExpires'),
  refreshToken: text('refreshToken'),
  refreshTokenExpires: text('refreshTokenExpires'),
  createdAt: text('createdAt').default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text('updatedAt').default(sql`(CURRENT_TIMESTAMP)`),
})

export const uploadedFiles = sqliteTable('uploaded_files', {
  id: text('id').primaryKey(),
  email: text('email'),
  fileId: text('fileId'),
  fileName: text('fileName'),
  publicLink: text('publicLink'),
  size: integer('size'),
  source: text('source'),
  createdAt: text('createdAt').default(sql`(CURRENT_TIMESTAMP)`),
})

export type UserRecord = typeof users.$inferSelect
export type NewUserRecord = typeof users.$inferInsert
export type BindTokenRecord = typeof bindTokens.$inferSelect
export type AppSessionRecord = typeof appSessions.$inferSelect
export type SmarterMailSessionRecord = typeof smartermailSessions.$inferSelect
export type UploadedFileRecord = typeof uploadedFiles.$inferSelect
