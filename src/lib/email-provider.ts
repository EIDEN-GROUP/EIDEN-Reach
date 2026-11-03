export type EmailProviderCapabilities = {
  protocol: 'imap_smtp' | 'api'
  folders: boolean
  moveMessages: boolean
  flags: boolean
  drafts: boolean
  send: boolean
  deliveryEvents: 'none' | 'smtp_acceptance' | 'provider_events'
  bounceEvents: boolean
  complaintEvents: boolean
  inboundWebhooks: boolean
}

export type MailboxConnection = {
  accountId: string
  address: string
  providerKey: string
}

export type FolderCursor = {
  providerFolderId: string
  uidValidity: number | null
  highestUid: number
}

export type SyncBatch = {
  messages: Array<{ providerMessageId: string; rfcMessageId: string | null; raw: Uint8Array }>
  nextCursor: FolderCursor
  hasMore: boolean
}

export type OutgoingMessage = {
  messageId: string
  from: string
  to: string[]
  cc?: string[]
  bcc?: string[]
  subject: string
  text: string
  html?: string
  headers?: Record<string, string>
}

export type SendResult =
  | { state: 'accepted'; providerMessageId?: string; acceptedAt: string }
  | { state: 'rejected'; providerCode: string; retryable: boolean }
  | { state: 'unknown'; reconciliationRequired: true }

export interface EmailProviderAdapter {
  readonly providerKey: string
  readonly capabilities: EmailProviderCapabilities
  verifyConnection(connection: MailboxConnection): Promise<void>
  listFolders(connection: MailboxConnection): Promise<Array<{ providerFolderId: string; displayName: string; specialUse?: string }>>
  syncFolder(connection: MailboxConnection, cursor: FolderCursor, limit: number): Promise<SyncBatch>
  fetchMessage(connection: MailboxConnection, providerMessageId: string): Promise<Uint8Array>
  sendMessage(connection: MailboxConnection, message: OutgoingMessage, idempotencyKey: string): Promise<SendResult>
  saveDraft(connection: MailboxConnection, message: OutgoingMessage): Promise<{ providerDraftId?: string }>
  updateFlags(connection: MailboxConnection, providerMessageId: string, flags: { read?: boolean; flagged?: boolean }): Promise<void>
  moveMessage(connection: MailboxConnection, providerMessageId: string, targetFolderId: string): Promise<void>
  disconnect(connection: MailboxConnection): Promise<void>
}

export class UnsupportedProviderCapabilityError extends Error {
  constructor(readonly providerKey: string, readonly capability: keyof EmailProviderCapabilities) {
    super(`Provider ${providerKey} does not support ${capability}.`)
    this.name = 'UnsupportedProviderCapabilityError'
  }
}

export function requireCapability(adapter: EmailProviderAdapter, capability: keyof EmailProviderCapabilities): void {
  if (adapter.capabilities[capability] === false || adapter.capabilities[capability] === 'none') {
    throw new UnsupportedProviderCapabilityError(adapter.providerKey, capability)
  }
}
