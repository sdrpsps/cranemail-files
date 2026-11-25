import assert from 'node:assert/strict'
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, mock, test } from 'node:test'
import { and, eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/libsql/migrator'

const tempDir = mkdtempSync(path.join(tmpdir(), 'cranemail-telegram-'))
const tokens = ['10001:abcdefghijklmnopqrstuvwxyz0123456789', '10002:ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789']
const emails = ['first@example.com', 'second@example.com', 'stranger@example.com']
let database: typeof import('../lib/db')
let api: typeof import('../app/api/[[...route]]/route')
let runtime: typeof import('../lib/bot/runtime')
let botUsers: typeof import('../lib/bot/users')
let decrypt: typeof import('../lib/crypto').decrypt
const cookies: string[] = []
const userIds: string[] = []
const messages: { token: string; text: string; reply_markup?: { inline_keyboard?: { text: string; callback_data: string }[][] } }[] = []
const registrations: { token: string; url: string; secret_token: string }[] = []
let botId = ''
let secondBotId = ''
let updateId = 1
let networkFailure = false
let onFileDownload: (() => Promise<void>) | undefined

before(async () => {
  process.env.TURSO_DATABASE_URL = `file:${path.join(tempDir, 'telegram.db')}`
  process.env.NEXT_PUBLIC_SITE_URL = 'https://site.example'
  process.env.ENCRYPTION_KEY = 'isolated-telegram-test-key'
  database = await import('../lib/db')
  const legacyFolder = path.join(tempDir, 'legacy-migrations')
  mkdirSync(path.join(legacyFolder, 'meta'), { recursive: true })
  const journal = JSON.parse(readFileSync('drizzle/meta/_journal.json', 'utf8'))
  journal.entries = journal.entries.slice(0, 2)
  writeFileSync(path.join(legacyFolder, 'meta/_journal.json'), JSON.stringify(journal))
  for (const entry of journal.entries) copyFileSync(`drizzle/${entry.tag}.sql`, path.join(legacyFolder, `${entry.tag}.sql`))
  await migrate(database.db, { migrationsFolder: legacyFolder })
  await database.client.execute("INSERT INTO users (id, email, telegramUserId) VALUES ('legacy-owner', 'legacy@example.com', '88')")
  await database.client.execute("INSERT INTO bind_tokens (token, userId, expiresAt) VALUES ('legacy-token', 'legacy-owner', '2099-01-01T00:00:00.000Z')")
  await database.client.execute("INSERT INTO app_sessions (id, userId, expiresAt) VALUES ('existing-session', 'legacy-owner', '2099-01-01T00:00:00.000Z')")
  await database.client.execute("INSERT INTO uploaded_files (id, email, fileName, shortCode) VALUES ('existing-file', 'legacy@example.com', 'existing.png', 'existing-short')")
  await migrate(database.db, { migrationsFolder: './drizzle' })
  api = await import('../app/api/[[...route]]/route')
  runtime = await import('../lib/bot/runtime')
  botUsers = await import('../lib/bot/users')
  decrypt = (await import('../lib/crypto')).decrypt
  const { SmarterMailClient } = await import('../lib/smartermail')
  mock.method(SmarterMailClient.prototype, 'authenticateUser', async (username: string, password: string) => ({
    success: password === 'password', emailAddress: username, username: username.split('@')[0],
    isAdmin: false, isDomainAdmin: false, accessToken: username, refreshToken: 'test-refresh',
    accessTokenExpiration: new Date(Date.now() + 86400000).toISOString(),
    refreshTokenExpiration: new Date(Date.now() + 172800000).toISOString(),
  }))
  mock.method(SmarterMailClient.prototype, 'getUserSettings', async () => {
    assert.fail('Telegram binding should use the local user record')
  })
  mock.method(SmarterMailClient.prototype, 'uploadFile', async (_token: string, _buffer: Buffer, name: string) => ({
    success: true, uploadData: { [name]: { id: `remote-${name}` } },
  }))
  mock.method(SmarterMailClient.prototype, 'generatePublicLink', async (_token: string, id: string) => ({
    success: true, publicLink: `/d/${id}`,
  }))
  mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = String(input)
    if (url.includes('/file/bot')) {
      if (onFileDownload) { const action = onFileDownload; onFileDownload = undefined; await action() }
      return new Response('file-content')
    }
    const match = url.match(/^https:\/\/api\.telegram\.org\/bot([^/]+)\/(\w+)$/)
    assert.ok(match, `Unexpected test request: ${url}`)
    const [, token, method] = match
    const payload = JSON.parse(String(init?.body || '{}'))
    if (method === 'getMe') {
      assert.ok(tokens.includes(token))
      return Response.json({ ok: true, result: {
        id: Number(token.split(':')[0]), is_bot: true, username: token === tokens[0] ? 'first_bot' : 'second_bot', first_name: 'Test bot',
        can_join_groups: false, can_read_all_group_messages: false, supports_inline_queries: false,
      } })
    }
    if (method === 'setWebhook') {
      registrations.push({ token, ...payload })
      return Response.json({ ok: true, result: true })
    }
    if (method === 'sendMessage' || method === 'editMessageText') {
      if (networkFailure) { networkFailure = false; throw new Error('Temporary connection failure') }
      messages.push({ token, ...payload })
      return Response.json({ ok: true, result: { message_id: messages.length, date: 1, chat: { id: 42, type: 'private' }, text: payload.text } })
    }
    if (method === 'answerCallbackQuery') return Response.json({ ok: true, result: true })
    if (method === 'getFile') return Response.json({ ok: true, result: { file_path: 'documents/file.png' } })
    throw new Error(`Unexpected Telegram method: ${method}`)
  })
  for (const email of emails) {
    const response = await request('/auth/login', 'POST', undefined, { username: email, password: 'password', serverUrl: 'https://mail.example' })
    assert.equal(response.status, 200)
    cookies.push(response.headers.get('Set-Cookie')!.split(';')[0])
    const [user] = await database.db.select().from(database.users).where(eq(database.users.email, email))
    userIds.push(user.id)
  }
})

after(() => {
  mock.restoreAll()
  database?.client.close()
  rmSync(tempDir, { recursive: true, force: true })
})

function request(endpoint: string, method = 'GET', account?: number, body?: unknown) {
  return api[method as 'GET' | 'POST' | 'DELETE'](new Request(`https://site.example/api${endpoint}`, {
    method,
    headers: { ...(account !== undefined ? { Cookie: cookies[account] } : {}), 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  }))
}

async function getBot(id = botId) {
  const [bot] = await database.db.select().from(database.telegramBots).where(eq(database.telegramBots.id, id))
  return bot
}

function message(text: string, from = 42, type = 'private') {
  const command = text.match(/^\/\w+(?:@\w+)?/)
  return { update_id: updateId++, message: {
    message_id: updateId, date: 1, chat: { id: from, type }, from: { id: from, is_bot: false, first_name: 'Test' }, text,
    ...(command ? { entities: [{ type: 'bot_command', offset: 0, length: command[0].length }] } : {}),
  } }
}

function callback(data: string, from = 42) {
  return { update_id: updateId++, callback_query: {
    id: `callback-${updateId}`, from: { id: from, is_bot: false, first_name: 'Test' }, data,
    chat_instance: 'test-chat', message: { message_id: 1, date: 1, chat: { id: from, type: 'private' } },
  } }
}

async function webhook(update: unknown, id = botId, secret?: string) {
  const bot = await getBot(id)
  return api.POST(new Request(`https://site.example/api/telegram/webhook/${id}`, {
    method: 'POST', headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Bot-Api-Secret-Token': secret ?? bot.webhookSecret,
    }, body: JSON.stringify(update),
  }))
}

async function bindToken(account: number, id = botId) {
  const response = await request('/auth/telegram/bind-token', 'POST', account, { password: 'password', botId: id })
  assert.equal(response.status, 200)
  return (await response.json()).data as { token: string; bindUrl: string }
}

async function currentAccount(id = botId, from = 42) {
  const bot = await (await import('../lib/bot/config')).findBotRuntime(id)
  return runtime.withBotRuntime(bot!, () => botUsers.getTelegramBoundUser(from))
}

test('bot management requires a signed-in account', async () => {
  assert.equal((await request('/telegram/bots')).status, 401)
  assert.equal((await request('/telegram/bots', 'POST', undefined, { token: tokens[0] })).status, 401)
})

test('the consolidated migration preserves account data and removes obsolete Telegram configuration', async () => {
  const [user] = await database.db.select().from(database.users).where(eq(database.users.id, 'legacy-owner'))
  assert.equal(user.email, 'legacy@example.com')
  const session = await database.client.execute("SELECT userId FROM app_sessions WHERE id = 'existing-session'")
  assert.equal(session.rows[0].userId, 'legacy-owner')
  const [file] = await database.db.select().from(database.uploadedFiles).where(eq(database.uploadedFiles.id, 'existing-file'))
  assert.equal(file.fileName, 'existing.png')
  assert.equal(file.shortCode, 'existing-short')
  const userColumns = await database.client.execute('PRAGMA table_info(users)')
  assert.ok(!userColumns.rows.some((column) => column.name === 'telegramUserId'))
  const tokenColumns = await database.client.execute('PRAGMA table_info(bind_tokens)')
  const botColumn = tokenColumns.rows.find((column) => column.name === 'botId')
  assert.equal(botColumn?.notnull, 1)
  assert.equal(botColumn?.dflt_value, null)
  assert.deepEqual(await database.db.select().from(database.bindTokens), [])
  assert.deepEqual(await database.db.select().from(database.telegramBindings), [])
  assert.deepEqual(await database.db.select().from(database.telegramSelections), [])
  assert.deepEqual(await database.db.select().from(database.telegramBots), [])
})

test('connecting a bot requires a valid token and a public HTTPS site origin', async () => {
  assert.equal((await request('/telegram/bots', 'POST', 0, { token: 'invalid' })).status, 400)
  process.env.NEXT_PUBLIC_SITE_URL = 'http://localhost:3000'
  try {
    assert.equal((await request('/telegram/bots', 'POST', 0, { token: tokens[0] })).status, 400)
  } finally {
    process.env.NEXT_PUBLIC_SITE_URL = 'https://site.example'
  }
  assert.equal(registrations.length, 0)
})

test('web configuration encrypts credentials and registers a bot-specific authenticated webhook', async () => {
  const response = await request('/telegram/bots', 'POST', 0, { token: tokens[0] })
  assert.equal(response.status, 200)
  const result = await response.json()
  botId = result.data.id
  const bot = await getBot()
  assert.notEqual(bot.encryptedToken, tokens[0])
  assert.equal(decrypt(bot.encryptedToken), tokens[0])
  assert.equal(registrations[0].url, `https://site.example/api/telegram/webhook/${botId}`)
  assert.equal(registrations[0].secret_token, bot.webhookSecret)
  const list = await request('/telegram/bots', 'GET', 0)
  const text = await list.text()
  assert.ok(!text.includes(tokens[0]) && !text.includes(bot.encryptedToken) && !text.includes(bot.webhookSecret))
})

test('bots are private to accounts that supplied their token', async () => {
  assert.deepEqual((await (await request('/telegram/bots', 'GET', 2)).json()).data, [])
  assert.equal((await request('/auth/telegram/bind-token', 'POST', 2, { password: 'password', botId })).status, 403)
  assert.equal((await request(`/telegram/bots/${botId}`, 'DELETE', 2)).status, 404)
})

test('adding the same bot from a second account reuses its identity and webhook secret', async () => {
  const response = await request('/telegram/bots', 'POST', 1, { token: tokens[0] })
  assert.equal((await response.json()).data.id, botId)
  assert.equal(registrations[0].secret_token, registrations[1].secret_token)
  assert.equal((await database.db.select().from(database.telegramBots)).length, 1)
  const response2 = await request('/telegram/bots', 'POST', 0, { token: tokens[1] })
  secondBotId = (await response2.json()).data.id
  assert.notEqual(botId, secondBotId)
})

test('webhooks reject missing, forged, and non-ASCII secrets before processing', async () => {
  for (const secret of ['', 'forged-secret', 'é'.repeat(64)]) {
    assert.equal((await webhook(message('/accounts'), botId, secret)).status, 403)
  }
  assert.equal((await webhook({ update_id: -1 })).status, 400)
  assert.equal((await webhook({ message: {} })).status, 400)
})

test('binding tokens are password-protected, bot-specific, single use, and expire', async () => {
  assert.equal((await request('/auth/telegram/bind-token', 'POST', 0, { password: 'incorrect', botId })).status, 401)
  const binding = await bindToken(0)
  assert.match(binding.bindUrl, /^https:\/\/t.me\/first_bot\?start=/)
  assert.equal((await webhook(message(`/start ${binding.token}`), secondBotId)).status, 200)
  assert.match(messages.at(-1)!.text, /another bot/)
  assert.equal((await webhook(message(`/start ${binding.token}`))).status, 200)
  assert.equal((await currentAccount())?.id, userIds[0])
  assert.equal((await webhook(message(`/start ${binding.token}`, 99))).status, 200)
  assert.equal(await currentAccount(botId, 99), undefined)
  const expired = await bindToken(0)
  await database.db.update(database.bindTokens).set({ expiresAt: '2000-01-01T00:00:00.000Z' }).where(eq(database.bindTokens.token, expired.token))
  await webhook(message(`/start ${expired.token}`, 99))
  assert.equal(await currentAccount(botId, 99), undefined)
})

test('adding a second CraneMail account keeps the first binding and upload selection', async () => {
  const binding = await bindToken(1)
  assert.equal((await webhook(message(`/start ${binding.token}`))).status, 200)
  const bindings = await database.db.select().from(database.telegramBindings)
    .where(and(eq(database.telegramBindings.botId, botId), eq(database.telegramBindings.telegramUserId, '42')))
  assert.equal(bindings.length, 2)
  assert.equal((await currentAccount())?.id, userIds[0])
  await webhook(message('/accounts'))
  assert.equal(messages.at(-1)!.reply_markup?.inline_keyboard?.length, 2)
})

test('account selection cannot access another Telegram user or bot bindings', async () => {
  await webhook(callback(`account:${userIds[1]}`, 99))
  assert.equal(await currentAccount(botId, 99), undefined)
  await webhook(callback(`account:${userIds[1]}`), secondBotId)
  assert.equal(await currentAccount(secondBotId), undefined)
  await webhook(callback(`account:${userIds[2]}`))
  assert.equal((await currentAccount())?.id, userIds[0])
  await webhook(callback(`account:${userIds[1]}`))
  assert.equal((await currentAccount())?.id, userIds[1])
})

test('group chats cannot consume account binding tokens', async () => {
  const binding = await bindToken(0)
  await webhook(message(`/start ${binding.token}`, 42, 'group'))
  assert.ok((await database.db.select().from(database.bindTokens).where(eq(database.bindTokens.token, binding.token))).length)
  assert.match(messages.at(-1)!.text, /private chat/)
})

test('a new bot has independent bindings and selection, and concurrent requests retain their credentials', async () => {
  const binding = await bindToken(0, secondBotId)
  await webhook(message(`/start ${binding.token}`), secondBotId)
  const beforeCount = messages.length
  await Promise.all([webhook(message('/accounts')), webhook(message('/accounts'), secondBotId)])
  const sent = messages.slice(beforeCount)
  assert.equal(sent.length, 2)
  assert.ok(sent.find((entry) => entry.token === tokens[0])?.text.includes(emails[1]))
  assert.ok(sent.find((entry) => entry.token === tokens[1])?.text.includes(emails[0]))
})

test('processed webhook updates are deduplicated and transient failures can be retried', async () => {
  const update = message('/accounts')
  const beforeCount = messages.length
  assert.equal((await webhook(update)).status, 200)
  assert.equal((await webhook(update)).status, 200)
  assert.equal(messages.length, beforeCount + 1)
  const retry = message('/accounts')
  networkFailure = true
  assert.equal((await webhook(retry)).status, 500)
  assert.equal((await webhook(retry)).status, 200)
})

test('uploads retain the account selected at the start even if selection changes during the download', async () => {
  assert.equal((await currentAccount())?.id, userIds[1])
  onFileDownload = async () => {
    const bot = await (await import('../lib/bot/config')).findBotRuntime(botId)
    await runtime.withBotRuntime(bot!, () => botUsers.selectTelegramAccount(42, userIds[0]))
  }
  const update = message('')
  const documentUpdate = { ...update, message: { ...update.message, document: { file_id: 'document', file_unique_id: 'unique', file_name: 'snapshot.png' } } }
  assert.equal((await webhook(documentUpdate)).status, 200)
  const [file] = await database.db.select().from(database.uploadedFiles).where(eq(database.uploadedFiles.fileName, 'snapshot.png'))
  assert.equal(file.email, emails[1])
  assert.ok(messages.at(-1)!.text.includes(emails[1]))
  assert.equal((await currentAccount())?.id, userIds[0])
})

test('old file-list callbacks keep their original account after selection changes', async () => {
  for (let i = 0; i < 8; i++) await database.db.insert(database.uploadedFiles).values({
    id: `page-${i}`, email: emails[1], fileName: `second-${i}.png`, publicLink: `/d/${i}`,
  })
  await webhook(callback(`files:${userIds[1]}:2`))
  assert.ok(messages.at(-1)!.text.includes(emails[1]))
  assert.ok(!messages.at(-1)!.text.includes(emails[0]))
  assert.equal((await currentAccount())?.id, userIds[0])
})

test('disconnect removes only the current account, revokes tokens, and requires explicit reselection', async () => {
  const binding = await bindToken(0)
  assert.equal((await request(`/telegram/bots/${botId}`, 'DELETE', 0)).status, 200)
  assert.equal(await currentAccount(), undefined)
  assert.equal((await database.db.select().from(database.bindTokens).where(eq(database.bindTokens.token, binding.token))).length, 0)
  await webhook(callback(`account:${userIds[1]}`))
  assert.equal((await currentAccount())?.id, userIds[1])
  assert.equal((await currentAccount(secondBotId))?.id, userIds[0])
  assert.equal((await (await request('/auth/me', 'GET', 1)).json()).data.isTelegramBound, true)
})

test('only explicitly configured bots and bot-specific webhooks are available', async () => {
  assert.throws(() => runtime.getBotRuntime(), /configured Telegram bot context/)
  assert.equal((await request('/auth/telegram/bind-token', 'POST', 0, { password: 'password' })).status, 403)
  assert.equal((await webhook(message('/accounts'), 'unknown-bot', 'secret')).status, 404)
  const old = await api.POST(new Request('https://site.example/api/telegram/webhook', { method: 'POST', body: JSON.stringify(message('/accounts')) }))
  assert.equal(old.status, 404)
})

test('reconnecting a bot does not restore disconnected CraneMail account bindings', async () => {
  assert.equal((await request('/telegram/bots', 'POST', 0, { token: tokens[0] })).status, 200)
  assert.equal((await currentAccount())?.id, userIds[1])
  const bindings = await database.db.select().from(database.telegramBindings)
    .where(and(eq(database.telegramBindings.botId, botId), eq(database.telegramBindings.userId, userIds[0])))
  assert.deepEqual(bindings, [])
  assert.equal((await (await request('/telegram/bots', 'GET', 0)).json()).data.find((bot: { id: string }) => bot.id === botId).telegramUserIds.length, 0)
})
