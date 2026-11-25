import { sql } from 'drizzle-orm'
import { customType, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core'

const sqliteDate = customType<{ data: Date; driverData: string }>({
  dataType: () => 'text',
  toDriver: (value) => value.toISOString(),
  fromDriver: (value) => new Date(value.includes('T') ? value : `${value.replace(' ', 'T')}Z`),
})

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull().default(''),
  email: text('email').unique(),
  emailVerified: integer('emailVerified', { mode: 'boolean' }).notNull().default(false),
  image: text('image'),
  serverUrl: text('serverUrl'),
  encryptedPassword: text('encryptedPassword'),
  createdAt: sqliteDate('createdAt').default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: sqliteDate('updatedAt').default(sql`(CURRENT_TIMESTAMP)`),
})

export const bindTokens = sqliteTable('bind_tokens', {
  token: text('token').primaryKey(),
  userId: text('userId').notNull(),
  botId: text('botId').notNull(),
  expiresAt: text('expiresAt'),
  createdAt: text('createdAt').default(sql`(CURRENT_TIMESTAMP)`),
  redeemedTelegramUserId: text('redeemedTelegramUserId'),
  redeemedUpdateId: integer('redeemedUpdateId'),
})

// Bot credentials are separate from the accounts that have configured or linked them.
export const telegramBots = sqliteTable('telegram_bots', {
  id: text('id').primaryKey(),
  telegramId: text('telegramId').notNull().unique(),
  username: text('username').notNull(),
  firstName: text('firstName').notNull(),
  botInfo: text('botInfo').notNull(),
  encryptedToken: text('encryptedToken').notNull(),
  webhookSecret: text('webhookSecret').notNull(),
  createdAt: text('createdAt').default(sql`(CURRENT_TIMESTAMP)`),
})

export const telegramBotAccounts = sqliteTable('telegram_bot_accounts', {
  botId: text('botId').notNull(),
  userId: text('userId').notNull(),
}, (table) => [primaryKey({ columns: [table.botId, table.userId] })])

export const telegramBindings = sqliteTable('telegram_bindings', {
  botId: text('botId').notNull(),
  telegramUserId: text('telegramUserId').notNull(),
  userId: text('userId').notNull(),
  createdAt: text('createdAt').default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [
  primaryKey({ columns: [table.botId, table.telegramUserId, table.userId] }),
])

export const telegramSelections = sqliteTable('telegram_selections', {
  botId: text('botId').notNull(),
  telegramUserId: text('telegramUserId').notNull(),
  userId: text('userId').notNull(),
}, (table) => [primaryKey({ columns: [table.botId, table.telegramUserId] })])

export const telegramUpdates = sqliteTable('telegram_updates', {
  botId: text('botId').notNull(),
  updateId: integer('updateId').notNull(),
  processed: integer('processed', { mode: 'boolean' }).notNull().default(false),
  createdAt: text('createdAt').default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [primaryKey({ columns: [table.botId, table.updateId] })])

export const appSessions = sqliteTable('app_sessions', {
  id: text('id').primaryKey(),
  userId: text('userId').notNull(),
  expiresAt: text('expiresAt').notNull(),
  createdAt: text('createdAt').default(sql`(CURRENT_TIMESTAMP)`),
  updatedAt: text('updatedAt').default(sql`(CURRENT_TIMESTAMP)`),
})

export const authSessions = sqliteTable('auth_sessions', {
  id: text('id').primaryKey(),
  token: text('token').notNull().unique(),
  userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: integer('expiresAt', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
}, (table) => [index('auth_sessions_userId_idx').on(table.userId)])

export const authAccounts = sqliteTable('auth_accounts', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId').notNull().references(() => users.id, { onDelete: 'cascade' }),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: integer('accessTokenExpiresAt', { mode: 'timestamp_ms' }),
  refreshTokenExpiresAt: integer('refreshTokenExpiresAt', { mode: 'timestamp_ms' }),
  scope: text('scope'),
  password: text('password'),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [index('auth_accounts_userId_idx').on(table.userId)])

export const authVerifications = sqliteTable('auth_verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: integer('expiresAt', { mode: 'timestamp_ms' }).notNull(),
  createdAt: integer('createdAt', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updatedAt', { mode: 'timestamp_ms' }).notNull(),
}, (table) => [index('auth_verifications_identifier_idx').on(table.identifier)])

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
  shortCode: text('shortCode'),
  size: integer('size'),
  source: text('source'),
  createdAt: text('createdAt').default(sql`(CURRENT_TIMESTAMP)`),
}, (table) => [
  uniqueIndex('uploaded_files_shortCode_unique').on(table.shortCode),
])

export type UserRecord = typeof users.$inferSelect
export type NewUserRecord = typeof users.$inferInsert
export type BindTokenRecord = typeof bindTokens.$inferSelect
export type SmarterMailSessionRecord = typeof smartermailSessions.$inferSelect
export type UploadedFileRecord = typeof uploadedFiles.$inferSelect
