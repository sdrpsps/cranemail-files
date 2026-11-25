import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { after, before, mock, test } from 'node:test'
import { eq } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/libsql/migrator'
import type { SmarterMailFileItem } from '../lib/smartermail'

const tempDir = mkdtempSync(path.join(tmpdir(), 'cranemail-flows-'))
const email = 'uploader@example.com'
const botToken = 'file-flow-test-token'
let database: typeof import('../lib/db')
let api: typeof import('../app/api/[[...route]]/route')
let shortlinks: typeof import('../lib/shortlink')
let cookie = ''
let uploadedId = ''
let uploadedCode = ''
let folderFiles: SmarterMailFileItem[] = []
const telegramMessages: string[] = []

before(async () => {
  process.env.TURSO_DATABASE_URL = `file:${path.join(tempDir, 'flows.db')}`
  process.env.NEXT_PUBLIC_SITE_URL = 'https://site.example'
  process.env.ENCRYPTION_KEY = 'isolated-test-key'
  database = await import('../lib/db')
  await migrate(database.db, { migrationsFolder: './drizzle' })
  shortlinks = await import('../lib/shortlink')
  api = await import('../app/api/[[...route]]/route')
  const { SmarterMailClient } = await import('../lib/smartermail')
  mock.method(SmarterMailClient.prototype, 'authenticateUser', async () => ({
    success: true, emailAddress: email, username: 'uploader', isAdmin: false, isDomainAdmin: false,
    accessToken: 'test-access', refreshToken: 'test-refresh',
    accessTokenExpiration: new Date(Date.now() + 86_400_000).toISOString(),
    refreshTokenExpiration: new Date(Date.now() + 172_800_000).toISOString(),
  }))
  mock.method(SmarterMailClient.prototype, 'getUserSettings', async () => ({
    success: true, userData: { emailAddress: email },
  }))
  mock.method(SmarterMailClient.prototype, 'uploadFile', async (_token: string, _buffer: Buffer, fileName: string) => ({
    success: true, uploadData: { [fileName]: { id: `remote-${fileName}` } },
  }))
  mock.method(SmarterMailClient.prototype, 'generatePublicLink', async (_token: string, fileId: string) => ({
    success: true, publicLink: `/d/${fileId}`,
  }))
  mock.method(SmarterMailClient.prototype, 'getFolder', async (_token: string, folderPath: string) => ({
    success: true, folder: {
      name: 'public', path: folderPath, size: 0, subFolders: [], files: folderFiles,
    },
  }))
  mock.method(SmarterMailClient.prototype, 'deleteFiles', async () => ({ success: true }))
  mock.method(globalThis, 'fetch', async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = String(input)
    if (url.endsWith('/sendMessage')) {
      telegramMessages.push(JSON.parse(String(init?.body)).text)
      return Response.json({ ok: true })
    }
    if (url.endsWith('/getFile')) {
      return Response.json({ ok: true, result: { file_path: 'documents/photo.png' } })
    }
    if (url.includes(`/file/bot${botToken}/`)) return new Response('test-file-bytes')
    throw new Error(`Unexpected network request in isolated test: ${url}`)
  })

  const login = await api.POST(new Request('https://site.example/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: email, password: 'test-password', serverUrl: 'https://custom-mail.example/',
    }),
  }))
  assert.equal(login.status, 200)
  cookie = login.headers.get('Set-Cookie')!.split(';')[0]
})

after(() => {
  mock.restoreAll()
  database?.client.close()
  rmSync(tempDir, { recursive: true, force: true })
})

function fileItem(id: string): SmarterMailFileItem {
  return {
    id, fileName: `${id}.png`, type: 'image/png', size: 10,
    dateAdded: '2026-11-24T00:00:00.000Z', published: true,
    publicDownloadLink: `/d/${id}`, folderPath: '/public',
  }
}

function syncFiles() {
  return api.POST(new Request('https://site.example/api/files/sync', {
    method: 'POST', headers: { Cookie: cookie },
  }))
}

test('web uploads return a stored code, short URL, and absolute original URL', async () => {
  const form = new FormData()
  form.append('file', new File(['image-content'], 'web-photo.png', { type: 'image/png' }))
  const response = await api.POST(new Request('https://site.example/api/upload', {
    method: 'POST', headers: { Cookie: cookie }, body: form,
  }))
  assert.equal(response.status, 200)
  const { data } = await response.json()
  uploadedId = data.id
  uploadedCode = data.shortCode
  assert.match(data.shortCode, /^[0-9A-Za-z]{7}$/)
  assert.equal(data.shortUrl, `https://site.example/s/${data.shortCode}`)
  assert.equal(data.publicLink, 'https://custom-mail.example/d/remote-web-photo.png')
  assert.equal(await shortlinks.resolveShortCode(data.shortCode), data.publicLink)
})

test('GET /files exposes the same code and short URL', async () => {
  const response = await api.GET(new Request('https://site.example/api/files', {
    headers: { Cookie: cookie },
  }))
  assert.equal(response.status, 200)
  const { data } = await response.json()
  const file = data.find((entry: { id: string }) => entry.id === uploadedId)
  assert.equal(file.shortCode, uploadedCode)
  assert.equal(file.shortUrl, `https://site.example/s/${uploadedCode}`)
})

test('sync assigns codes to new and existing files without duplicating other accounts', async () => {
  await database.db.insert(database.uploadedFiles).values([
    { id: 'sync-existing', email, fileId: 'existing', publicLink: '/d/existing' },
    { id: 'other-account', email: 'other@example.com', fileId: 'shared-id', publicLink: '/d/shared-id' },
  ])
  folderFiles = [fileItem('existing'), fileItem('new-file'), fileItem('shared-id')]
  const response = await syncFiles()
  assert.equal(response.status, 200)
  assert.equal((await response.json()).data.syncedCount, 2)
  const files = await database.db.select().from(database.uploadedFiles)
    .where(eq(database.uploadedFiles.email, email))
  for (const id of ['existing', 'new-file', 'shared-id']) {
    const file = files.find((entry) => entry.fileId === id)
    assert.ok(file?.shortCode && shortlinks.isValidShortCode(file.shortCode))
    assert.equal(await shortlinks.resolveShortCode(file.shortCode), `https://custom-mail.example/d/${id}`)
  }
  const repeated = await syncFiles()
  assert.equal((await repeated.json()).data.syncedCount, 0)
})

test('sync recognizes normalized absolute links when the remote file ID changes', async () => {
  folderFiles = [{ ...fileItem('changed-id'), publicDownloadLink: '/d/new-file' }]
  const response = await syncFiles()
  assert.equal(response.status, 200)
  assert.equal((await response.json()).data.syncedCount, 0)
})

test('Telegram uploads store a code and show short plus original URLs', async () => {
  const [user] = await database.db.select().from(database.users).where(eq(database.users.email, email))
  await database.db.insert(database.telegramBindings).values({
    botId: 'file-flow-bot', telegramUserId: '42', userId: user.id,
  })
  const { handleFileUpload } = await import('../lib/bot/upload')
  const { withBotRuntime } = await import('../lib/bot/runtime')
  await withBotRuntime({ id: 'file-flow-bot', token: botToken },
    () => handleFileUpload(42, 42, 'telegram-file', 'bot-photo.png'))
  const [file] = await database.db.select().from(database.uploadedFiles)
    .where(eq(database.uploadedFiles.source, 'telegram'))
  assert.ok(file?.shortCode && shortlinks.isValidShortCode(file.shortCode))
  assert.equal(file.publicLink, 'https://custom-mail.example/d/remote-bot-photo.png')
  const completion = telegramMessages.at(-1)!
  assert.ok(completion.includes(shortlinks.buildShortUrl(file.shortCode)))
  assert.ok(completion.includes(file.publicLink))
  assert.ok(completion.includes('<b>Link:</b>'))
  assert.ok(completion.includes('<b>Original link:</b>'))
})

test('the existing delete endpoint removes the short-link record', async () => {
  const response = await api.DELETE(new Request(`https://site.example/api/files/${uploadedId}`, {
    method: 'DELETE', headers: { Cookie: cookie },
  }))
  assert.equal(response.status, 200)
  assert.equal(await shortlinks.resolveShortCode(uploadedCode), null)
})
