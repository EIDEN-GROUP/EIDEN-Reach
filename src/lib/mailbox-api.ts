import { supabase } from './supabase'

export type MailboxSummary = {
  id: string
  owner_id: string
  provider_key: string
  email_address: string
  display_name: string | null
  connection_state: string
  last_sync_at: string | null
  last_error_code: string | null
  created_at: string
  imap_host: string
  imap_port: number
  imap_tls_mode: string
  smtp_host: string
  smtp_port: number
  smtp_tls_mode: string
}

export type MailboxTestResult = {
  ok: true
  imap: { status: 'authenticated'; port: number; tlsMode: string }
  smtp: { status: 'authenticated'; host: string; port: number; tlsMode: string }
}

export type ConnectMailboxInput = { organizationId: string; email: string; displayName: string; password: string }

export class MailboxApiError extends Error {
  constructor(message: string) { super(message); this.name = 'MailboxApiError' }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const base = import.meta.env.VITE_MAILBOX_WORKER_URL?.replace(/\/$/, '')
  if (!base) throw new MailboxApiError('Mailbox service is not configured for this workspace.')
  let endpoint: URL
  try { endpoint = new URL(base) } catch { throw new MailboxApiError('Mailbox service URL is invalid.') }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)
  if (endpoint.protocol !== 'https:' && !(local && endpoint.protocol === 'http:')) {
    throw new MailboxApiError('Mailbox service must use HTTPS outside local development.')
  }
  if (!supabase) throw new MailboxApiError('Connect the workspace database before adding a mailbox.')
  const { data } = await supabase.auth.getSession()
  const token = data.session?.access_token
  if (!token) throw new MailboxApiError('Sign in again before using mailbox settings.')
  let response: Response
  try {
    response = await fetch(`${base}${path}`, {
      ...init,
      headers: { ...(init.headers ?? {}), authorization: `Bearer ${token}` },
    })
  } catch {
    throw new MailboxApiError('Mailbox service could not be reached. Check the configured Worker URL.')
  }
  const body = await response.json().catch(() => null) as ({ error?: string; code?: string } & T) | null
  if (!response.ok) {
    const message = body?.error ?? 'Mailbox service could not complete the request.'
    throw new MailboxApiError(body?.code ? `${message} (${body.code})` : message)
  }
  if (!body) throw new MailboxApiError('Mailbox service returned an invalid response.')
  return body as T
}

export function listMailboxes(organizationId: string) {
  return request<{ mailboxes: MailboxSummary[] }>(`/mailboxes?organizationId=${encodeURIComponent(organizationId)}`)
}

export function testMailbox(input: ConnectMailboxInput) {
  return request<MailboxTestResult>('/mailboxes/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })
}

export function connectMailbox(input: ConnectMailboxInput) {
  return request<{ ok: true; mailboxId: string; email: string; connectionState: string; syncState: string }>('/mailboxes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) })
}

export type MailboxSyncResult = {
  ok: true
  mailboxId: string
  folders: Array<{ provider_folder_id: string; display_name: string; highest_synced_uid: number; sync_state: string }>
  synchronizedMessages: number
  hasMore: boolean
  message: string
}

export function syncMailbox(organizationId: string, mailboxId: string) {
  return request<MailboxSyncResult>('/mailboxes/sync', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ organizationId, mailboxId }) })
}

export function sendSequenceStep(organizationId: string, enrollmentId: string) {
  return request<{ ok: true; enrollmentId: string; contactEmail: string; stepPosition: number; unsubscribeUrl: string }>('/sequences/send', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ organizationId, enrollmentId }) })
}

export function dispatchDue(organizationId: string, limit = 5) {
  return request<{ ok: true; claimed: number; succeeded: number; retried: number; failed: number; dispatched_at: string; results: Array<{ id: string; ok: boolean; error?: string }> }>('/sequences/dispatch-due', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ organizationId, limit }) })
}

/** Fire-and-forget: asks the worker to post the sequence-completion Slack message if this stop made it the last one. */
export function checkSequenceCompletion(organizationId: string, sequenceId: string): Promise<void> {
  return request<{ ok: true }>('/sequences/complete-check', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ organizationId, sequenceId }) }).then(() => undefined).catch(() => undefined)
}


