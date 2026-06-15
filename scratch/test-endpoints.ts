import fs from 'fs'
import path from 'path'

// 1. Manually load environment variables from .env.local
try {
  const envPath = path.resolve(process.cwd(), '.env.local')
  if (fs.existsSync(envPath)) {
    const envFile = fs.readFileSync(envPath, 'utf8')
    envFile.split('\n').forEach((line) => {
      const trimmed = line.trim()
      if (trimmed && !trimmed.startsWith('#')) {
        const parts = trimmed.split('=')
        if (parts.length >= 2) {
          const key = parts[0].trim()
          const value = parts.slice(1).join('=').trim().replace(/^['"]|['"]$/g, '')
          process.env[key] = value
        }
      }
    })
    console.log('Loaded environment configuration from .env.local')
  }
} catch (err) {
  console.error('Error loading .env.local manually:', err)
}

import { db } from '../lib/db'
import { decrypt } from '../lib/crypto'
import { SmarterMailClient } from '../lib/smartermail'

async function runProbes() {
  try {
    // 2. Fetch the first user from local DB
    console.log('Fetching user from DB...')
    const result = await db.execute('SELECT * FROM users LIMIT 1')
    if (result.rows.length === 0) {
      console.error('Error: No bound users in the database to run probe. Please login to the dashboard first.')
      process.exit(1)
    }

    const user: any = result.rows[0]
    console.log(`Bound user: ${user.email} (Server: ${user.serverUrl})`)

    if (!user.encryptedPassword) {
      console.error('Error: Encrypted password not found in DB.')
      process.exit(1)
    }

    // 3. Decrypt password
    const password = decrypt(user.encryptedPassword)
    const client = new SmarterMailClient(user.serverUrl)

    // 4. Authenticate to get current accessToken
    console.log('Authenticating with SmarterMail...')
    const authResult = await client.authenticateUser(user.email, password)
    if (!authResult.success || !authResult.accessToken) {
      console.error('Error: SmarterMail authentication failed:', authResult.message)
      process.exit(1)
    }
    const token = authResult.accessToken
    console.log('Authenticated successfully.')

    // 5. Helper function to test an endpoint
    const testRequest = async (method: 'GET' | 'POST', apiPath: string, body?: any) => {
      const url = `${user.serverUrl.replace(/\/+$/, '')}/${apiPath.replace(/^\/+/, '')}`
      console.log(`\n----------------------------------------\nProbing: ${method} ${url} (Body: ${body ? JSON.stringify(body) : 'none'})`)
      try {
        const res = await fetch(url, {
          method,
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          ...(body ? { body: JSON.stringify(body) } : {})
        })
        console.log(`Status: ${res.status} ${res.statusText}`)
        const text = await res.text()
        try {
          const parsed = JSON.parse(text)
          console.log('Response (JSON):', JSON.stringify(parsed, null, 2).substring(0, 1000))
        } catch {
          console.log('Response (Text):', text.substring(0, 500))
        }
      } catch (err: any) {
        console.error('Request failed:', err.message)
      }
    }

    // Probes for File Storage listing
    await testRequest('GET', 'api/v1/filestorage/get-files-and-folders')
    await testRequest('GET', 'api/v1/filestorage/get-files-and-folders?folderPath=/')
    await testRequest('POST', 'api/v1/filestorage/get-folder-info', { folderPath: '/' })
    await testRequest('POST', 'api/v1/filestorage/get-folder-info', { folderPath: '' })
    await testRequest('GET', 'api/v1/filestorage/folder?folderPath=/')
    await testRequest('GET', 'api/v1/filestorage')
    await testRequest('GET', 'api/v1/filestorage/list')
    await testRequest('GET', 'api/v1/filestorage/get-folder-items?folderPath=/')
    await testRequest('GET', 'api/v1/filestorage/get-files?folderPath=/')

  } catch (err: any) {
    console.error('Unhandled error in probes:', err.message)
  }
}

runProbes()
