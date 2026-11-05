import type { Env } from './runtime'

const encoder = new TextEncoder()

export function decodeBase64(value: string): Uint8Array<ArrayBuffer> {
  const standard = value.replace(/-/g, '+').replace(/_/g, '/')
  const padding = '='.repeat((4 - (standard.length % 4)) % 4)
  const binary = atob(standard + padding)
  const bytes = new Uint8Array(new ArrayBuffer(binary.length))
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

export function encodeBase64(value: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < value.length; offset += 0x8000) {
    binary += String.fromCharCode(...value.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}

export async function decryptCredentials(env: Env, organizationId: string, email: string, row: { key_version: string; nonce: string; ciphertext: string }): Promise<string> {
  const rawKey = decodeBase64(env.MAILBOX_ENCRYPTION_KEY)
  if (rawKey.byteLength !== 32) throw new Error('credential_encryption_not_configured')
  const key = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['decrypt'])
  const nonce = decodeBase64(row.nonce)
  const ciphertext = decodeBase64(row.ciphertext)
  const associatedData = encoder.encode(`${organizationId}:${email}:v1`)
  const cleartext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce, additionalData: associatedData }, key, ciphertext)
  const parsed = JSON.parse(new TextDecoder().decode(cleartext)) as { password?: string }
  if (typeof parsed.password !== 'string') throw new Error('credential_decode_failed')
  return parsed.password
}

export async function encryptCredentials(env: Env, input: { organizationId: string; email: string; password: string; displayName?: string }) {
  const rawKey = decodeBase64(env.MAILBOX_ENCRYPTION_KEY)
  if (rawKey.byteLength !== 32 || !env.MAILBOX_ENCRYPTION_KEY_VERSION) throw new Error('credential_encryption_not_configured')
  const key = await crypto.subtle.importKey('raw', rawKey, 'AES-GCM', false, ['encrypt'])
  const nonce = crypto.getRandomValues(new Uint8Array(12))
  const associatedData = encoder.encode(`${input.organizationId}:${input.email}:v1`)
  const cleartext = encoder.encode(JSON.stringify({ username: input.email, password: input.password }))
  const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce, additionalData: associatedData }, key, cleartext)
  return {
    keyVersion: env.MAILBOX_ENCRYPTION_KEY_VERSION,
    nonce: encodeBase64(nonce),
    ciphertext: encodeBase64(new Uint8Array(encrypted)),
  }
}
