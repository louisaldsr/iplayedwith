/**
 * Signed-cookie session for the admin portal's single shared password.
 * Uses Web Crypto (crypto.subtle) rather than Node's `crypto` module so the
 * same code runs unchanged in both Edge middleware and Node route handlers.
 */

export const ADMIN_SESSION_COOKIE = 'admin_session'
export const ADMIN_SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60 // 7 days

function requireSecret(): string {
  const secret = process.env.ADMIN_PASSWORD
  if (!secret) throw new Error('ADMIN_PASSWORD is not set')
  return secret
}

async function getKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  )
}

function toBase64Url(bytes: Uint8Array): string {
  const binary = String.fromCharCode(...bytes)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(value.length + ((4 - (value.length % 4)) % 4), '=')
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0))
}

/** Creates a signed session token containing an expiry timestamp. */
export async function createSessionToken(): Promise<string> {
  const key = await getKey(requireSecret())
  const payload = String(Date.now() + ADMIN_SESSION_MAX_AGE_SECONDS * 1000)
  const payloadBytes = new TextEncoder().encode(payload)
  const signature = await crypto.subtle.sign('HMAC', key, payloadBytes)
  return `${toBase64Url(payloadBytes)}.${toBase64Url(new Uint8Array(signature))}`
}

/** Verifies a session token's signature and expiry. */
export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false
  const [payloadPart, signaturePart] = token.split('.')
  if (!payloadPart || !signaturePart) return false

  try {
    const key = await getKey(requireSecret())
    const payloadBytes = fromBase64Url(payloadPart)
    const signatureBytes = fromBase64Url(signaturePart)
    const valid = await crypto.subtle.verify('HMAC', key, new Uint8Array(signatureBytes), new Uint8Array(payloadBytes))
    if (!valid) return false

    const expiresAt = Number(new TextDecoder().decode(payloadBytes))
    return Number.isFinite(expiresAt) && Date.now() < expiresAt
  } catch {
    return false
  }
}

/** Constant-time comparison, used to check the submitted password on login. */
export function constantTimeEqual(a: string, b: string): boolean {
  const aBytes = new TextEncoder().encode(a)
  const bBytes = new TextEncoder().encode(b)
  const len = Math.max(aBytes.length, bBytes.length)
  let diff = aBytes.length ^ bBytes.length
  for (let i = 0; i < len; i++) diff |= (aBytes[i] ?? 0) ^ (bBytes[i] ?? 0)
  return diff === 0
}
