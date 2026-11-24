import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { test } from 'node:test'

function inspectSite(url: string, environment = '') {
  const result = spawnSync(
    process.execPath,
    [
      '--import', 'tsx', '-e',
      `
        const { siteMetadata, siteUrl } = require('./lib/site.ts');
        const { default: sitemap } = require('./app/sitemap.ts');
        const { default: robots } = require('./app/robots.ts');
        const { metadata: dashboard } = require('./app/upload/layout.tsx');
        console.log(JSON.stringify({
          metadata: siteMetadata, url: siteUrl.href,
          sitemap: sitemap(), robots: robots(), dashboard,
        }));
      `,
    ],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env,
        NEXT_PUBLIC_SITE_URL: url,
        VERCEL_ENV: environment,
      },
    },
  )

  assert.equal(result.status, 0, result.stderr)
  return JSON.parse(result.stdout)
}

test('public metadata uses the configured origin and only lists the home page', () => {
  const result = inspectSite(' https://files.example.com/unwanted?source=test#section ')
  assert.equal(result.url, 'https://files.example.com/')
  assert.equal(result.metadata.alternates.canonical, '/')
  assert.equal(result.metadata.robots.index, true)
  assert.equal(result.metadata.robots.googleBot.index, true)
  assert.deepEqual(result.sitemap, [{ url: 'https://files.example.com/' }])
  assert.equal(result.robots.sitemap, 'https://files.example.com/sitemap.xml')
  // Crawlers need access to read noindex on dashboards and short redirects.
  assert.deepEqual(result.robots.rules.disallow, ['/api/'])
  assert.equal(result.dashboard.robots.index, false)
  assert.equal(result.dashboard.robots.googleBot.index, false)
  assert.equal(result.dashboard.alternates.canonical, '/upload')
  assert.equal(result.dashboard.openGraph.url, '/upload')
})

test('local and Vercel preview sites do not advertise indexable pages', () => {
  for (const [url, environment] of [
    ['', ''],
    ['http://localhost:3000', ''],
    ['http://127.0.0.1:3000', ''],
    ['http://[::1]:3000', ''],
    ['https://files.example.com', 'preview'],
    ['https://files.example.com', 'development'],
  ]) {
    const result = inspectSite(url, environment)
    assert.equal(result.metadata.robots.index, false, `${url} ${environment}`)
    assert.equal(result.metadata.robots.googleBot.index, false)
    assert.deepEqual(result.sitemap, [])
    assert.equal(result.robots.sitemap, undefined)
  }
  assert.equal(
    inspectSite('https://files.example.com', 'production').metadata.robots.index,
    true,
  )
})

test('social metadata points both platforms to the shipped 1200×630 PNG', () => {
  const { metadata } = inspectSite('https://files.example.com')
  const image = metadata.openGraph.images[0]
  assert.equal(image.width, 1200)
  assert.equal(image.height, 630)
  assert.ok(image.alt)
  assert.equal(metadata.twitter.card, 'summary_large_image')
  assert.equal(metadata.twitter.images[0].url, image.url)
  assert.equal(metadata.twitter.images[0].alt, image.alt)
  assert.ok(existsSync(`public${image.url}`))
  const png = readFileSync(`public${image.url}`)
  assert.equal(png.subarray(1, 4).toString(), 'PNG')
  assert.equal(png.readUInt32BE(16), image.width)
  assert.equal(png.readUInt32BE(20), image.height)
})
