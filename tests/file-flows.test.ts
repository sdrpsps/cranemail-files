import assert from 'node:assert/strict'
import { randomBytes } from 'node:crypto'
import { after, before, mock, test } from 'node:test'
import { eq } from 'drizzle-orm'
import { SmarterMailClient, SmarterMailHttpError } from '../lib/smartermail'
import type { SmarterMailFileItem } from '../lib/smartermail'
import { createTestDatabase } from './d1-fixture'

const email = 'uploader@example.com'
const existingUserId = 'existing-uploader'
const authCookie = '__Secure-better-auth.session_token'
const botToken = 'file-flow-test-token'
let database: Awaited<ReturnType<typeof createTestDatabase>>
let handleApiRequest: typeof import('../lib/api').handleApiRequest
let shortlinks: typeof import('../lib/shortlink')
let cookie = ''
let uploadedId = ''
let uploadedCode = ''
let folderFiles: SmarterMailFileItem[] = []
const telegramMessages: string[] = []

before(async () => {
  process.env.NEXT_PUBLIC_SITE_URL = 'https://site.example'
  process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex')
  process.env.ENCRYPTION_KEY = 'isolated-test-key'
  database = await createTestDatabase()
  await database.migrate()
  await database.db.insert(database.users).values({ id: existingUserId, email })
  await database.db.insert(database.appSessions).values({
    id: 'legacy-session', userId: existingUserId, expiresAt: '2099-01-01T00:00:00.000Z',
  })
  shortlinks = await import('../lib/shortlink')
  handleApiRequest = (await import('../lib/api')).handleApiRequest
  mock.method(SmarterMailClient.prototype, 'authenticateUser', async () => ({
    success: true, emailAddress: email, username: 'uploader', isAdmin: false, isDomainAdmin: false,
    accessToken: 'test-access', refreshToken: 'test-refresh',
    accessTokenExpiration: new Date(Date.now() + 86_400_000).toISOString(),
    refreshTokenExpiration: new Date(Date.now() + 172_800_000).toISOString(),
  }))
  mock.method(SmarterMailClient.prototype, 'getUserSettings', async () => {
    assert.fail('Web routes should use the local user record')
  })
  mock.method(SmarterMailClient.prototype, 'uploadFile', async (_token: string, _buffer: Buffer, fileName: string) => ({
    success: true, uploadData: { [fileName]: { id: `remote-${fileName}` } },
  }))
  mock.method(SmarterMailClient.prototype, 'ensureFolderExists', async () => {})
  mock.method(SmarterMailClient.prototype, 'sendFileStream', async (
    _token: string,
    file: ReadableStream<Uint8Array>,
    { fileName, size, mode }: Parameters<SmarterMailClient['sendFileStream']>[2],
  ) => {
    assert.equal(mode, 'fixed')
    assert.equal((await new Response(file).arrayBuffer()).byteLength, size)
    return { success: true, uploadData: { [fileName]: { id: `remote-${fileName}` } } }
  })
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

  const login = await signIn()
  assert.equal(login.status, 200)
  const sessionCookie = login.headers.getSetCookie().find((value) => value.startsWith(`${authCookie}=`))
  assert.ok(sessionCookie)
  assert.match(sessionCookie, /;\s*HttpOnly/i)
  assert.match(sessionCookie, /;\s*Secure/i)
  assert.match(sessionCookie, /;\s*SameSite=Lax/i)
  assert.match(sessionCookie, /;\s*Max-Age=2592000/i)
  cookie = sessionCookie.split(';')[0]
})

after(async () => {
  mock.restoreAll()
  await database?.dispose()
})

function fileItem(id: string): SmarterMailFileItem {
  return {
    id, fileName: `${id}.png`, type: 'image/png', size: 10,
    dateAdded: '2026-11-24T00:00:00.000Z', published: true,
    publicDownloadLink: `/d/${id}`, folderPath: '/public',
  }
}

function signIn(origin = 'https://site.example') {
  return handleApiRequest(new Request('https://site.example/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({
      username: email, password: 'test-password', serverUrl: 'https://custom-mail.example/',
    }),
  }))
}

function getMe(sessionCookie: string) {
  return handleApiRequest(new Request('https://site.example/api/auth/me', {
    headers: { Cookie: sessionCookie },
  }))
}

function syncFiles() {
  return handleApiRequest(new Request('https://site.example/api/files/sync', {
    method: 'POST', headers: { Cookie: cookie },
  }))
}

function webUpload(fileName: string, requestId: string = crypto.randomUUID(), signal?: AbortSignal) {
  const body = new File(['image-content'], fileName, { type: 'image/png' })
  return handleApiRequest(new Request('https://site.example/api/upload', {
    method: 'POST',
    headers: {
      Cookie: cookie,
      'X-Upload-Id': requestId,
      'X-Upload-Name': encodeURIComponent(fileName),
      'X-Upload-Size': String(body.size),
    },
    body,
    signal,
  }))
}

test('Better Auth signs the session cookie and reuses the existing SmarterMail user ID', async () => {
  const [session] = await database.db.select().from(database.authSessions)
  assert.equal(session.userId, existingUserId)
  const lifetime = session.expiresAt.getTime() - session.createdAt.getTime()
  assert.ok(Math.abs(lifetime - 30 * 24 * 60 * 60 * 1000) < 1_000)
  assert.equal((await getMe(cookie)).status, 200)
  assert.equal((await getMe(`${authCookie}=${session.token}`)).status, 401)
  assert.equal((await getMe('app_session_id=legacy-session')).status, 401)
})

test('SmarterMail rejection and untrusted login origins do not create app sessions', async (t) => {
  const authenticate = t.mock.method(SmarterMailClient.prototype, 'authenticateUser', async () => ({
    success: false, message: 'Invalid credentials',
  }))
  const rejectedOrigin = await signIn('https://other.example')
  assert.equal(rejectedOrigin.status, 403)
  assert.equal(authenticate.mock.callCount(), 0)
  const rejectedCredentials = await signIn()
  assert.equal(rejectedCredentials.status, 401)
  assert.equal(rejectedCredentials.headers.get('Set-Cookie'), null)
  assert.equal(authenticate.mock.callCount(), 1)
  assert.equal((await database.db.select().from(database.authSessions)).length, 1)
})

test('web uploads return a stored code, short URL, and absolute original URL', async () => {
  const response = await webUpload('web-photo.png')
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
  const response = await handleApiRequest(new Request('https://site.example/api/files', {
    headers: { Cookie: cookie },
  }))
  assert.equal(response.status, 200)
  const { data } = await response.json()
  const file = data.find((entry: { id: string }) => entry.id === uploadedId)
  assert.equal(file.shortCode, uploadedCode)
  assert.equal(file.shortUrl, `https://site.example/s/${uploadedCode}`)
})

test('local identity and the file list stay available when SmarterMail credentials expire', async (t) => {
  const [session] = await database.db.select().from(database.smartermailSessions)
  const storedSession = eq(database.smartermailSessions.userId, session.userId)
  await database.db.update(database.smartermailSessions)
    .set({ accessTokenExpires: '2000-01-01T00:00:00.000Z' })
    .where(storedSession)

  const refresh = t.mock.method(SmarterMailClient.prototype, 'refreshToken', async () => {
    throw new SmarterMailHttpError(503, 'Temporarily unavailable')
  })
  const authenticate = t.mock.method(SmarterMailClient.prototype, 'authenticateUser', async () => {
    assert.fail('Local endpoints should never authenticate with SmarterMail')
  })

  try {
    const response = await handleApiRequest(new Request('https://site.example/api/auth/me', {
      headers: { Cookie: cookie },
    }))
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('Set-Cookie'), null)
    assert.deepEqual((await response.json()).data, {
      username: 'uploader', emailAddress: email, serverUrl: 'https://custom-mail.example', isTelegramBound: false,
    })

    const files = await handleApiRequest(new Request('https://site.example/api/files', {
      headers: { Cookie: cookie },
    }))
    assert.equal(files.status, 200)
    assert.equal((await files.json()).data[0].id, uploadedId)
    assert.equal(refresh.mock.callCount(), 0)
    assert.equal(authenticate.mock.callCount(), 0)

    const sync = await syncFiles()
    assert.equal(sync.status, 502)
    assert.equal(sync.headers.get('Set-Cookie'), null)
    assert.equal(refresh.mock.callCount(), 1)
    assert.equal(authenticate.mock.callCount(), 0)
  } finally {
    await database.db.update(database.smartermailSessions)
      .set({ accessTokenExpires: session.accessTokenExpires })
      .where(storedSession)
  }
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

test('file deletion checks local ownership before SmarterMail and keeps the session on upstream rejection', async (t) => {
  const deleteFiles = t.mock.method(SmarterMailClient.prototype, 'deleteFiles', async () => {
    throw new SmarterMailHttpError(401, 'Unauthorized')
  })
  const refresh = t.mock.method(SmarterMailClient.prototype, 'refreshToken', async () => ({
    success: true,
    accessToken: 'refreshed-access',
    accessTokenExpiration: new Date(Date.now() + 86_400_000).toISOString(),
  }))
  const deleteFile = (id: string) => handleApiRequest(new Request(`https://site.example/api/files/${id}`, {
    method: 'DELETE', headers: { Cookie: cookie },
  }))

  assert.equal((await deleteFile('other-account')).status, 404)
  assert.equal(deleteFiles.mock.callCount(), 0)
  assert.equal(refresh.mock.callCount(), 0)

  const response = await deleteFile(uploadedId)
  assert.equal(response.status, 502)
  assert.equal(response.headers.get('Set-Cookie'), null)
  assert.equal(refresh.mock.callCount(), 1)
  assert.deepEqual(deleteFiles.mock.calls.map(({ arguments: args }) => args[0]), ['test-access', 'refreshed-access'])
  assert.ok(await shortlinks.resolveShortCode(uploadedCode))

  const me = await handleApiRequest(new Request('https://site.example/api/auth/me', {
    headers: { Cookie: cookie },
  }))
  assert.equal(me.status, 200)
  assert.equal((await me.json()).data.isTelegramBound, true)
})

test('the existing delete endpoint removes the short-link record', async () => {
  const response = await handleApiRequest(new Request(`https://site.example/api/files/${uploadedId}`, {
    method: 'DELETE', headers: { Cookie: cookie },
  }))
  assert.equal(response.status, 200)
  assert.equal(await shortlinks.resolveShortCode(uploadedCode), null)
})

test('web upload retries finish indexing without resending the file to CraneMail', async (t) => {
  const requestId = crypto.randomUUID()
  const stream = t.mock.method(SmarterMailClient.prototype, 'sendFileStream')
  let shareAllowed = false
  t.mock.method(SmarterMailClient.prototype, 'generatePublicLink', async () => (
    shareAllowed ? { success: true, publicLink: '/d/retry-photo' } : { success: false }
  ))

  assert.equal((await webUpload('retry-photo.png', requestId)).status, 502)
  shareAllowed = true
  const resumed = await webUpload('retry-photo.png', requestId)
  assert.equal(resumed.status, 200)
  const { data } = await resumed.json()
  const replay = await webUpload('retry-photo.png', requestId)
  assert.equal(replay.status, 200)
  assert.deepEqual((await replay.json()).data, data)
  assert.equal(stream.mock.callCount(), 1)
  assert.equal((await webUpload('different.png', requestId)).status, 409)
})

test('a 401 during transmission cannot replay its body on authentication or client retry', async (t) => {
  const stream = t.mock.method(SmarterMailClient.prototype, 'sendFileStream', async (
    _token: string,
    body: ReadableStream<Uint8Array>,
  ) => {
    await new Response(body).arrayBuffer()
    throw new SmarterMailHttpError(401, 'Expired during upload')
  })
  const requestId = crypto.randomUUID()
  assert.equal((await webUpload('rejected.png', requestId)).status, 502)
  assert.equal((await webUpload('rejected.png', requestId)).status, 409)
  assert.equal(stream.mock.callCount(), 1)
})

test('the size limit and canceled requests stop before upload transmission', async (t) => {
  const stream = t.mock.method(SmarterMailClient.prototype, 'sendFileStream')
  const previousLimit = process.env.UPLOAD_MAX_BYTES
  process.env.UPLOAD_MAX_BYTES = '5'
  try {
    assert.equal((await webUpload('oversized.png')).status, 413)
  } finally {
    if (previousLimit === undefined) delete process.env.UPLOAD_MAX_BYTES
    else process.env.UPLOAD_MAX_BYTES = previousLimit
  }
  assert.equal((await webUpload('canceled.png', crypto.randomUUID(), AbortSignal.abort())).status, 408)
  assert.equal(stream.mock.callCount(), 0)
})

test('expired local sessions return 401 and clear the cookie', async () => {
  const [session] = await database.db.select().from(database.authSessions)
  await database.db.update(database.authSessions)
    .set({ expiresAt: new Date('2000-01-01T00:00:00.000Z') })
    .where(eq(database.authSessions.id, session.id))

  for (const route of ['auth/me', 'files']) {
    const response = await handleApiRequest(new Request(`https://site.example/api/${route}`, {
      headers: { Cookie: cookie },
    }))
    assert.equal(response.status, 401)
    assert.ok(response.headers.getSetCookie().some((value) => value.startsWith(`${authCookie}=;`)))
  }
})

test('logout revokes only the session used for the request', async () => {
  const first = (await signIn()).headers.getSetCookie()
    .find((value) => value.startsWith(`${authCookie}=`))!.split(';')[0]
  const second = (await signIn()).headers.getSetCookie()
    .find((value) => value.startsWith(`${authCookie}=`))!.split(';')[0]
  const logout = await handleApiRequest(new Request('https://site.example/api/auth/logout', {
    method: 'POST', headers: { Cookie: first, Origin: 'https://site.example' },
  }))
  assert.equal(logout.status, 200)
  assert.deepEqual((await logout.json()).data, null)
  assert.ok(logout.headers.getSetCookie().some((value) => value.startsWith(`${authCookie}=;`)))
  assert.equal((await getMe(first)).status, 401)
  assert.equal((await getMe(second)).status, 200)
  assert.equal((await database.db.select().from(database.authSessions)).length, 1)
})
