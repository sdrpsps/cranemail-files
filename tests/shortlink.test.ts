import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import { syncBuiltinESMExports } from 'node:module'
import { after, before, test } from 'node:test'
import { eq } from 'drizzle-orm'
import { createTestDatabase } from './d1-fixture'

let database: Awaited<ReturnType<typeof createTestDatabase>>
let shortlinks: typeof import('../lib/shortlink')
let route: typeof import('../app/s/[code]/route')
let retry: typeof import('../lib/shortlink-code').withShortCodeRetry

before(async () => {
  process.env.NEXT_PUBLIC_SITE_URL = 'https://site.example'
  process.env.NEXT_PUBLIC_SMARTERMAIL_URL = 'https://mail.example'
  database = await createTestDatabase()
  shortlinks = await import('../lib/shortlink')
  route = await import('../app/s/[code]/route')
  retry = (await import('../lib/shortlink-code')).withShortCodeRetry
})

after(async () => {
  await database?.dispose()
})

function requestCode(code: string) {
  return route.GET(new Request(`https://short.example/s/${encodeURIComponent(code)}`), {
    params: Promise.resolve({ code }),
  })
}

test('requests require explicit migrations and do not create tables', async () => {
  await assert.rejects(requestCode('Unknown'), /D1 is not ready/)
  const before = await database.binding.prepare("SELECT name FROM sqlite_schema WHERE name = 'uploaded_files'").all()
  assert.equal(before.results.length, 0)
  await database.migrate()
  const response = await requestCode('Unknown')
  assert.equal(response.status, 404)
  const { results: columns }: { results: { name: string }[] } = await database.binding.prepare('PRAGMA table_info(uploaded_files)').all()
  assert.ok(columns.some((column) => column.name === 'shortCode'))
})

test('new codes contain exactly seven lowercase base36 characters', () => {
  const codes = Array.from({ length: 1000 }, () => shortlinks.generateShortCode())
  assert.ok(codes.every((code) => /^[0-9a-z]{7}$/.test(code)))
  assert.equal(new Set(codes).size, codes.length)
  assert.equal(shortlinks.isValidShortCode('Ab12cDe'), true)
  for (const invalid of ['', 'abc', '12345678', 'abc_def', '1234567\n', '1234567\r', '中文测试123', 'a/b?cde']) {
    assert.equal(shortlinks.isValidShortCode(invalid), false)
  }
})

test('code generation preserves leading zeros and integers above 32 bits', (t) => {
  const cases = [
    [0, '0000000'],
    [35, '000000z'],
    [36, '0000010'],
    [2 ** 32, '1z141z4'],
    [36 ** 7 - 1, 'zzzzzzz'],
  ] as const

  let value: number = 0
  const random = t.mock.method(crypto, 'randomInt', (max: number) => {
    assert.equal(max, 36 ** 7)
    return value
  })
  syncBuiltinESMExports()
  try {
    for (const [input, expected] of cases) {
      value = input
      assert.equal(shortlinks.generateShortCode(), expected)
    }
  } finally {
    random.mock.restore()
    syncBuiltinESMExports()
  }
})

test('short URLs use the site origin, trim trailing slashes, and fall back locally', () => {
  assert.equal(shortlinks.buildShortUrl('Ab12cDe'), 'https://site.example/s/Ab12cDe')
  process.env.NEXT_PUBLIC_SITE_URL = ' https://site.example/// '
  assert.equal(shortlinks.buildShortUrl('Ab12cDe'), 'https://site.example/s/Ab12cDe')
  process.env.NEXT_PUBLIC_SITE_URL = '   '
  assert.equal(shortlinks.buildShortUrl('Ab12cDe'), 'http://localhost:3000/s/Ab12cDe')
  delete process.env.NEXT_PUBLIC_SITE_URL
  assert.equal(shortlinks.buildShortUrl('Ab12cDe'), 'http://localhost:3000/s/Ab12cDe')
  process.env.NEXT_PUBLIC_SITE_URL = 'https://site.example'
})

test('parallel inserts receive distinct codes', async () => {
  const codes = await Promise.all(Array.from({ length: 40 }, (_, index) =>
    shortlinks.insertFileWithShortCode({
      id: `parallel-${index}`,
      publicLink: `https://storage.example/${index}.png`,
    })))
  assert.equal(new Set(codes).size, 40)
  assert.equal(await shortlinks.resolveShortCode(codes[0]), 'https://storage.example/0.png')
})

test('concurrent assignments preserve the first stored code', async () => {
  await database.db.insert(database.uploadedFiles).values({ id: 'unassigned' })
  const codes = await Promise.all(Array.from({ length: 12 }, () =>
    shortlinks.assignShortCode('unassigned')))
  assert.ok(codes[0] && shortlinks.isValidShortCode(codes[0]))
  assert.equal(new Set(codes).size, 1)
  assert.equal(await shortlinks.assignShortCode('unassigned'), codes[0])
  assert.equal(await shortlinks.assignShortCode('missing'), null)
})

test('a real short-code uniqueness violation is retried', async () => {
  await database.db.insert(database.uploadedFiles).values({ id: 'occupied', shortCode: 'Ab12cDe' })
  let attempts = 0
  const { shortCode } = await retry((code) => {
    attempts++
    return database.db.insert(database.uploadedFiles).values({
      id: 'retry-success',
      shortCode: attempts === 1 ? 'Ab12cDe' : code,
    })
  })
  assert.equal(attempts, 2)
  const [file] = await database.db.select().from(database.uploadedFiles)
    .where(eq(database.uploadedFiles.id, 'retry-success'))
  assert.equal(file.shortCode, shortCode)
})

test('short-code collisions stop after five attempts', async () => {
  let attempts = 0
  await assert.rejects(retry(() => {
    attempts++
    throw new Error('wrapped query failure', {
      cause: new Error('SQLITE_CONSTRAINT_UNIQUE: UNIQUE constraint failed: uploaded_files.shortCode'),
    })
  }), /wrapped query failure/)
  assert.equal(attempts, 5)
})

test('other uniqueness failures are not retried', async () => {
  let attempts = 0
  await assert.rejects(retry((code) => {
    attempts++
    return database.db.insert(database.uploadedFiles).values({ id: 'occupied', shortCode: code })
  }))
  assert.equal(attempts, 1)
})

test('legacy relative links resolve through their owner or the mail-server fallback', async () => {
  await database.db.insert(database.users).values({
    id: 'custom-server-user', email: 'custom@example.com', serverUrl: 'https://custom-mail.example/',
  })
  await database.db.insert(database.uploadedFiles).values([
    { id: 'relative-owner', email: 'custom@example.com', publicLink: '/d/image.png', shortCode: 'Owner01' },
    { id: 'relative-fallback', publicLink: 'd/image.png', shortCode: 'Fall001' },
  ])
  assert.equal(await shortlinks.resolveShortCode('Owner01'), 'https://custom-mail.example/d/image.png')
  assert.equal(await shortlinks.resolveShortCode('Fall001'), 'https://mail.example/d/image.png')
})

test('redirects return 302, the original destination, and standard cache headers', async () => {
  const response = await requestCode('Owner01')
  assert.equal(response.status, 302)
  assert.equal(response.headers.get('Location'), 'https://custom-mail.example/d/image.png')
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=60, s-maxage=300')
})

test('invalid codes, unknown codes, and missing targets return uncached 404 responses', async () => {
  await database.db.insert(database.uploadedFiles).values({ id: 'no-target', shortCode: 'NoLink1' })
  for (const code of ['bad_code', 'waytoolong', 'a/b?cde', 'Unknown', 'NoLink1']) {
    const response = await requestCode(code)
    assert.equal(response.status, 404)
    assert.equal(response.headers.get('Cache-Control'), 'no-store')
    assert.equal(await shortlinks.resolveShortCode('bad_code'), null)
  }
})

test('an unresolved relative target returns 404 instead of redirecting to this app', async () => {
  const base = process.env.NEXT_PUBLIC_SMARTERMAIL_URL
  process.env.NEXT_PUBLIC_SMARTERMAIL_URL = ''
  try {
    assert.equal((await requestCode('Fall001')).status, 404)
  } finally {
    process.env.NEXT_PUBLIC_SMARTERMAIL_URL = base
  }
})

test('deleting the file removes its short-link destination', async () => {
  const code = await shortlinks.insertFileWithShortCode({
    id: 'to-delete', publicLink: 'https://storage.example/deleted.png',
  })
  assert.equal((await requestCode(code)).status, 302)
  await database.db.delete(database.uploadedFiles).where(eq(database.uploadedFiles.id, 'to-delete'))
  assert.equal((await requestCode(code)).status, 404)
})

test('Telegram lists use short links and preserve a properly joined original fallback', async () => {
  const { renderFilesList } = await import('../lib/bot/files')
  await database.db.insert(database.uploadedFiles).values([
    {
      id: 'bot-short', email: 'bot@example.com', fileName: '<photo>.png',
      shortCode: 'Bot0001', publicLink: 'https://storage.example/short.png',
    },
    {
      id: 'bot-fallback', email: 'bot@example.com', fileName: 'legacy.png',
      publicLink: 'https://other.example/fallback.png?a=1&b=2',
    },
  ])
  const result = await renderFilesList({
    id: 'bot-user', email: 'bot@example.com', serverUrl: 'https://mail.example',
  }, 1)
  assert.ok(result.text.includes('https://site.example/s/Bot0001'))
  assert.ok(result.text.includes('https://other.example/fallback.png?a=1&amp;b=2'))
  assert.ok(result.text.includes('&lt;photo&gt;.png'))
  assert.ok(!result.text.includes('https://mail.example/https://'))
})
