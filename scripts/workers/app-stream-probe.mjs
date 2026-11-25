import assert from 'node:assert/strict'
import { execFile, spawn } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { EventEmitter, once } from 'node:events'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { createServer, request as httpRequest } from 'node:http'
import { createSecureServer } from 'node:http2'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'

const run = promisify(execFile)
const host = '127.0.0.1'
const origin = `http://${host}:8787`
const wrangler = './node_modules/.bin/wrangler'
const chunkBytes = Number(process.env.WORKERS_PROBE_CHUNK_BYTES || 512 * 1024)
assert.ok(Number.isSafeInteger(chunkBytes) && chunkBytes >= 64 * 1024)
const report = new EventEmitter()
const states = new Map()
const scratch = await mkdtemp(join(tmpdir(), 'cranemail-app-stream-'))
const recoveryFile = 'browser-file.bin'
const binaryFiles = ['first.bin', 'second.bin', recoveryFile]
const environment = {
  ...process.env,
  WRANGLER_SEND_METRICS: 'false',
  CLOUDFLARE_INCLUDE_PROCESS_ENV: 'false',
  CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV: 'true',
}

async function listen(server) {
  server.listen(0, host)
  await once(server, 'listening')
  return server.address().port
}

async function browserProbe(size) {
  const submit = (name, body, duplex) => fetch('/api/upload', {
    method: 'POST',
    body,
    ...(duplex ? { duplex: 'half' } : {}),
    headers: { 'X-Upload-Id': crypto.randomUUID(), 'X-Upload-Name': name, 'X-Upload-Size': String(size * 2) },
  }).then(async (response) => {
    if (!response.ok) throw new Error(await response.text())
    return (await response.json()).data
  })

  const gated = await Promise.all(['first.bin', 'second.bin'].map(async (name) => {
    let received
    const buffer = new ReadableStream({
      start(controller) { controller.enqueue(new Uint8Array(size).fill(97)) },
      async pull(controller) {
        const deadline = performance.now() + 10_000
        while (performance.now() < deadline) {
          const state = await fetch(`/progress?file=${name}`).then((response) => response.json())
          if (state.bytes >= 64 * 1024) {
            if (state.complete || state.bytes >= size * 2) throw new Error(`Invalid gate for ${name}`)
            received = state.bytes
            controller.enqueue(new Uint8Array(size).fill(98))
            controller.close()
            return
          }
          await new Promise((resolve) => setTimeout(resolve, 25))
        }
        throw new Error(`Browser tail stayed gated for ${name}`)
      },
    })
    const result = await submit(name, buffer, true)
    return { name, received, result }
  }))
  const name = 'browser-file.bin'
  const file = new File([new Uint8Array(size).fill(97), new Uint8Array(size).fill(98)], name)
  return [...gated, { name, result: await submit(name, file, false) }]
}

const upstream = createServer(async (request, response) => {
  const json = (body) => response.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(body))
  try {
    if (request.url === '/api/v1/auth/authenticate-user') {
      request.resume()
      return json({
        success: true, emailAddress: 'app-probe@example.test', username: 'app-probe', isAdmin: false, isDomainAdmin: false,
        accessToken: 'fixture-access', refreshToken: 'fixture-refresh',
        accessTokenExpiration: '2099-01-01T00:00:00Z', refreshTokenExpiration: '2099-01-01T00:00:00Z',
      })
    }
    assert.equal(request.headers.authorization, 'Bearer fixture-access')
    if (request.url === '/api/v1/filestorage/folder-put') {
      request.resume()
      return json({ success: true })
    }
    if (request.url === '/api/v1/filestorage/folder') {
      const { folder } = JSON.parse(Buffer.concat(await Array.fromAsync(request)).toString())
      const uploaded = states.get(recoveryFile)
      assert.ok(uploaded?.complete)
      assert.equal(folder, uploaded.folder)
      return json({
        success: true,
        folder: { files: [{ id: `id-${recoveryFile}`, fileName: recoveryFile, size: uploaded.bytes }] },
      })
    }
    const link = request.url.match(/^\/api\/v1\/filestorage\/(id-[^/]+)\/getlink\/public$/)
    if (link) return json({ success: true, publicLink: `/shared/${link[1]}` })
    assert.equal(request.url, '/api/v1/filestorage/upload')
    const chunks = []
    let name
    let byteCount = 0
    let headerLength = 0
    for await (const chunk of request) {
      chunks.push(chunk)
      byteCount += chunk.length
      if (!name) {
        const prefix = Buffer.concat(chunks)
        headerLength = prefix.indexOf('\r\n\r\n') + 4
        if (headerLength >= 4) {
          name = /filename="([^"]+)"/.exec(prefix.subarray(0, headerLength).toString())?.[1]
          assert.ok(binaryFiles.includes(name))
        }
      }
      if (name) states.set(name, { bytes: byteCount - headerLength, complete: false })
    }
    const body = Buffer.concat(chunks)
    assert.equal(Number(request.headers['content-length']), body.length)
    assert.equal(request.headers['transfer-encoding'], undefined)
    const form = await new Response(body, { headers: { 'Content-Type': request.headers['content-type'] } }).formData()
    const file = form.get('file')
    assert.equal(file.name, name)
    assert.equal(file.size, chunkBytes * 2)
    const folder = form.get('folder')
    assert.match(folder, /^\/public\/\d{4}\/\d{2}\/\d{2}$/)
    assert.deepEqual(Buffer.from(await file.arrayBuffer()), Buffer.concat([Buffer.alloc(chunkBytes, 97), Buffer.alloc(chunkBytes, 98)]))
    states.set(name, { bytes: file.size, complete: true, contentLength: body.length, folder })
    if (name === recoveryFile) return json({ success: true, uploadData: {} })
    return json({ success: true, uploadData: { [name]: { id: `id-${name}` } } })
  } catch (error) {
    console.error(error)
    response.writeHead(500).end('Fixture rejected request')
  }
})

let worker
let ingress
let chrome
let workerLog = ''
try {
  const upstreamPort = await listen(upstream)
  const stateDir = join(scratch, 'd1')
  const envFile = join(scratch, 'fixture.env')
  await writeFile(envFile, [
    `BETTER_AUTH_SECRET=${randomBytes(32).toString('hex')}`,
    `ENCRYPTION_KEY=${randomBytes(32).toString('hex')}`,
    `BETTER_AUTH_URL=${origin}`,
    '',
  ].join('\n'), { mode: 0o600 })
  await run(wrangler, ['d1', 'migrations', 'apply', 'DB', '--local', '--persist-to', stateDir], { env: environment })
  worker = spawn(wrangler, [
    'dev', '--local', '--ip', host, '--port', '8787', '--persist-to', stateDir, '--env-file', envFile,
  ], { env: environment, stdio: ['ignore', 'pipe', 'pipe'] })
  for (const output of [worker.stdout, worker.stderr]) output.on('data', (data) => { workerLog += data.toString() })
  let ready = false
  for (let attempt = 0; attempt < 80 && worker.exitCode === null; attempt++) {
    try { ready = (await fetch(origin, { signal: AbortSignal.timeout(500) })).ok } catch {}
    if (ready) break
    await new Promise((resolve) => setTimeout(resolve, 200))
  }
  assert.ok(ready, 'OpenNext preview did not start')
  const login = await fetch(`${origin}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: origin },
    body: JSON.stringify({
      username: 'app-probe@example.test',
      password: 'synthetic-input',
      serverUrl: `http://${host}:${upstreamPort}`,
    }),
  })
  assert.equal(login.status, 200, await login.text())
  const cookie = login.headers.getSetCookie()[0].split(';')[0]
  assert.ok(cookie)
  await run('openssl', [
    'req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-subj', '/CN=localhost', '-days', '1',
    '-keyout', join(scratch, 'key.pem'), '-out', join(scratch, 'cert.pem'),
  ])
  ingress = createSecureServer({
    key: await readFile(join(scratch, 'key.pem')),
    cert: await readFile(join(scratch, 'cert.pem')),
  }, (request, response) => {
    const url = new URL(request.url, origin)
    if (url.pathname === '/') {
      return response.writeHead(200, { 'Content-Type': 'text/html' }).end(`<script>
        const report = (data) => fetch('/report', { method: 'POST', body: JSON.stringify(data) });
        (${browserProbe})(${chunkBytes}).then(report, (error) => report({ error: error.stack }));
      </script>`)
    }
    if (url.pathname === '/progress') return response.end(JSON.stringify(states.get(url.searchParams.get('file')) ?? { bytes: 0 }))
    if (url.pathname === '/report') {
      const chunks = []
      request.on('data', (chunk) => chunks.push(chunk))
      request.on('end', () => { response.end(); report.emit('result', JSON.parse(Buffer.concat(chunks))) })
      return
    }
    const headers = { Cookie: cookie }
    for (const name of ['content-length', 'content-type', 'x-upload-id', 'x-upload-name', 'x-upload-size']) {
      if (request.headers[name]) headers[name] = request.headers[name]
    }
    const relay = httpRequest(new URL(url.pathname, origin), { method: request.method, headers }, (result) => {
      response.writeHead(result.statusCode, { 'Content-Type': result.headers['content-type'] ?? 'text/plain' })
      result.pipe(response)
    })
    relay.on('error', () => { if (!response.headersSent) response.writeHead(502); response.end() })
    request.on('aborted', () => relay.destroy())
    request.pipe(relay)
  })
  const ingressPort = await listen(ingress)
  const resultPromise = once(report, 'result', { signal: AbortSignal.timeout(25_000) })
  const browser = process.env.WORKERS_PROBE_CHROME || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  chrome = spawn(browser, [
    '--headless', '--no-first-run', '--disable-background-networking', '--ignore-certificate-errors',
    `--user-data-dir=${join(scratch, 'chrome')}`, `https://${host}:${ingressPort}/`,
  ], { stdio: 'ignore' })
  chrome.once('error', (error) => report.emit('error', error))
  const [results] = await resultPromise
  assert.ok(Array.isArray(results), results.error)
  assert.equal(results.length, binaryFiles.length)
  for (const entry of results) {
    const state = states.get(entry.name)
    assert.equal(state.complete, true)
    assert.equal(entry.result.size, state.bytes)
    assert.equal(entry.result.fileName, entry.name)
    assert.match(entry.result.shortUrl, /\/s\/[0-9a-z]{7}$/)
    assert.equal(entry.result.publicLink, `http://${host}:${upstreamPort}/shared/id-${entry.name}`)
    const redirect = await fetch(`${origin}/s/${entry.result.shortCode}`, { redirect: 'manual' })
    assert.equal(redirect.status, 302)
    assert.equal(redirect.headers.get('location'), entry.result.publicLink)
    if (entry.name !== 'browser-file.bin') {
      assert.ok(entry.received >= 64 * 1024)
      assert.ok(entry.received < state.bytes)
    }
    console.log(JSON.stringify({ name: entry.name, bytes: state.bytes, upstreamBeforeTail: entry.received ?? null, contentLength: state.contentLength }))
  }
} catch (error) {
  console.error(workerLog)
  throw error
} finally {
  for (const child of [chrome, worker]) {
    if (child?.pid && child.exitCode === null) {
      child.kill()
      await once(child, 'exit')
    }
  }
  ingress?.close()
  upstream.close()
  await rm(scratch, { recursive: true, force: true })
}
