import crypto from 'crypto'

function getEncryptionKey() {
  const configured = process.env.ENCRYPTION_KEY
  if (!configured) throw new Error('ENCRYPTION_KEY is required.')
  return crypto.createHash('sha256').update(configured).digest()
}

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // 12 bytes is standard for GCM

/**
 * Encrypts a string using AES-256-GCM.
 * Returns a colon-separated string: iv:authTag:encryptedText
 */
export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv)
  
  let encrypted = cipher.update(text, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  
  const authTag = cipher.getAuthTag().toString('hex')
  
  return `${iv.toString('hex')}:${authTag}:${encrypted}`
}

/**
 * Decrypts a colon-separated cipher text using AES-256-GCM.
 */
export function decrypt(cipherText: string): string {
  const parts = cipherText.split(':')
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted text format')
  }
  
  const [ivHex, authTagHex, encryptedHex] = parts
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  
  const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv)
  decipher.setAuthTag(authTag)
  
  let decrypted = decipher.update(encryptedHex, 'hex', 'utf8')
  decrypted += decipher.final('utf8')
  
  return decrypted
}
