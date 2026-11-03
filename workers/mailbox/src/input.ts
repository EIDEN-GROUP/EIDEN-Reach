export type MailboxInput = { organizationId: string; email: string; displayName: string; password: string }

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function parseMailboxInput(value: unknown): MailboxInput | null {
  if (!value || typeof value !== 'object') return null
  const input = value as Record<string, unknown>
  if (typeof input.organizationId !== 'string' || !uuidPattern.test(input.organizationId)) return null
  if (typeof input.email !== 'string' || input.email.length > 320) return null
  const email = input.email.trim().toLowerCase()
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return null
  if (typeof input.password !== 'string' || input.password.length < 1 || input.password.length > 1024 || /[\r\n\0]/.test(input.password)) return null
  if (input.displayName !== undefined && (typeof input.displayName !== 'string' || input.displayName.trim().length > 120)) return null
  return { organizationId: input.organizationId, email, password: input.password, displayName: typeof input.displayName === 'string' ? input.displayName.trim() : '' }
}
