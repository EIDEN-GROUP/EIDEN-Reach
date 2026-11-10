import PostalMime from 'postal-mime'
import {
  fetchImapMessages,
  listImapFolders,
  MailboxProtocolError,
  searchImapUids,
  sendSmtpEmail,
  verifyMailboxCredentials,
} from './protocols'
import { mapParsedEmail } from './mail-mapping'
import { parseMailboxInput, type MailboxInput } from './input'
import { stopEnrollmentsForReply, reconcileReplyStoppedEnrollments, processBounceMessage } from './worker-reply'
import { decodeBase64, decryptCredentials, encryptCredentials } from './worker-crypto'
import { handleUnsubscribe, sendSequenceStep, unsubscribeConfirmationHtml } from './worker-sequence'
import { handleSystemDispatch } from './worker-dispatch'
import { runMailboxSync } from './worker-mailbox-sync'

import type { Env } from './runtime'
import { serviceHeaders } from './runtime'

type Identity = { id: string; email?: string }
type Membership = { role: 'super_admin' | 'sales_manager' | 'sales_representative' | 'analyst' }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const rolesAllowed = new Set(['super_admin', 'sales_manager', 'sales_representative'])
function nowSql() { return new Date().toISOString() }
function getBase(env: Env): string { return (env.SUPABASE_URL || '').replace(/\/$/, '') }

function response(body: unknown, status: number, origin: string | null, env: Env) {
  const headers = new Headers({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' })
  if (origin === env.APP_ORIGIN) {
    headers.set('Access-Control-Allow-Origin', origin)
    headers.set('Access-Control-Allow-Headers', 'authorization, content-type')
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    headers.set('Vary', 'Origin')
  }
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers })
}

async function parseInput(request: Request): Promise<MailboxInput | null> {
  const contentLength = Number(request.headers.get('content-length') ?? '0')
  if (contentLength > 8192) return null
  const rawText = await request.text()
  if (rawText.length > 8192) return null
  let value: unknown
  try { value = JSON.parse(rawText) } catch { return null }
  return parseMailboxInput(value)
}

async function verifyIdentity(request: Request, env: Env): Promise<Identity | null> {
  const authorization = request.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return null
  const result = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`, {
    headers: { apikey: env.SUPABASE_ANON_KEY, authorization },
  })
  if (!result.ok) return null
  const user = await result.json() as Identity
  return typeof user.id === 'string' && uuidPattern.test(user.id) ? user : null
}

async function getMembership(env: Env, organizationId: string, userId: string): Promise<Membership | null> {
  const url = new URL(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/memberships`)
  url.searchParams.set('select', 'role')
  url.searchParams.set('organization_id', `eq.${organizationId}`)
  url.searchParams.set('user_id', `eq.${userId}`)
  url.searchParams.set('limit', '1')
  const result = await fetch(url, { headers: serviceHeaders(env) })
  if (!result.ok) throw new Error('membership_query_failed')
  const rows = await result.json() as Membership[]
  return rows[0] ?? null
}

async function rpc<T>(env: Env, name: string, body: Record<string, unknown>): Promise<T> {
  const result = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: serviceHeaders(env, true), body: JSON.stringify(body),
  })
  if (!result.ok) throw new Error(`rpc_${name}_failed`)
  return await result.json() as T
}

async function reserveConnectionTest(env: Env, organizationId: string, userId: string) {
  const reserved = await rpc<boolean>(env, 'reserve_mailbox_connection_test', {
    target_organization: organizationId, acting_user: userId,
  })
  return reserved === true
}

function publicTestError(error: unknown) {
  if (error instanceof MailboxProtocolError) {
    const messages: Record<string, string> = {
      imap_connection_failed: 'Could not establish a secure IMAP connection to the mailbox host.',
      imap_authentication_failed: 'IMAP rejected the mailbox address or password.',
      smtp_connection_failed: 'Could not establish a secure SMTP connection to the mailbox host.',
      smtp_tls_failed: 'The SMTP server did not complete secure TLS setup.',
      smtp_authentication_failed: 'SMTP rejected the mailbox address or password.',
      smtp_auth_not_supported: 'The SMTP server did not advertise a supported password authentication method.',
      connection_timeout: 'The mailbox server did not respond before the connection test timed out.',
    }
    return { code: error.code, message: messages[error.code] ?? 'Mailbox connection could not be verified.' }
  }
  return { code: 'connection_test_failed', message: 'Mailbox connection could not be verified. Check the provider settings and retry.' }
}

async function handle(request: Request, env: Env): Promise<Response> {
  const origin = request.headers.get('origin')
  const url = new URL(request.url)
  if (request.method === 'GET' && url.pathname === '/unsubscribe') {
    const token = url.searchParams.get('token') ?? ''
    const result = await handleUnsubscribe(env, token)
    const html = unsubscribeConfirmationHtml(result.ok ? result.message : result.error, result.ok)
    return new Response(html, { status: result.ok ? 200 : 400, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
  }
  if (origin && origin !== env.APP_ORIGIN) return response({ error: 'Origin is not allowed.' }, 403, null, env)
  if (request.method === 'OPTIONS') return response(null, 204, origin, env)
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) return response({ error: 'Mailbox service is not configured.' }, 503, origin, env)
  if (origin && !env.APP_ORIGIN) return response({ error: 'Application origin is not configured.' }, 503, null, env)

  if (request.method !== 'GET' && request.method !== 'POST') return response({ error: 'Method not allowed.' }, 405, origin, env)

  // No-auth background dispatcher (system-secret-gated)
  if (url.pathname === '/system/mailbox-sync-all' && request.method === 'POST') {
    const supplied = request.headers.get('x-dispatch-secret') ?? ''
    const ok = !!env.DISPATCH_TOKEN && supplied === env.DISPATCH_TOKEN
    if (!ok) return response({ error: 'Unauthorized' }, 401, origin, env)
    const listRes = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/mailbox_accounts?select=id,organization_id&connection_state=eq.connected&limit=200`, { headers: serviceHeaders(env) })
    const mailboxes = listRes.ok ? (await listRes.json() as Array<{ id: string; organization_id: string }>) : []
    const results: Array<{ id: string; ok: boolean; status?: number; error?: string }> = []
    for (const mailbox of mailboxes) {
      try {
        const r = await fetch(new URL('/mailboxes/sync', `http://127.0.0.1:8787`), {
          method: 'POST',
          headers: { 'x-internal-cron-secret': env.DISPATCH_TOKEN ?? '', 'Content-Type': 'application/json' },
          body: JSON.stringify({ organizationId: mailbox.organization_id, mailboxId: mailbox.id }),
        })
        const text = await r.text().catch(() => '')
        results.push({ id: mailbox.id, ok: r.ok, status: r.status, error: r.ok ? undefined : text.slice(0, 200) })
      } catch (error) {
        results.push({ id: mailbox.id, ok: false, error: error instanceof Error ? error.message : 'sync_failed' })
      }
    }
    return response({ ok: true, count: results.length, results }, 200, origin, env)
  }

  if (url.pathname === '/system/dispatch-due' && request.method === 'POST') {
    const token = request.headers.get('x-dispatch-secret') ?? ''
    const { handleSystemDispatch } = await import('./worker-dispatch')
    const result = await handleSystemDispatch(env, token, 10)
    if (result.status !== 200) return response({ error: (result.body as { error?: string })?.error ?? 'dispatch failed' }, result.status, origin, env)
    return response(result.body as Record<string, unknown>, 200, origin, env)
  }

  const isInternal = !!env.DISPATCH_TOKEN && request.headers.get('x-internal-cron-secret') === env.DISPATCH_TOKEN
  const identity = isInternal ? { id: '00000000-0000-0000-0000-000000000000' } : await verifyIdentity(request, env)
  if (!identity) return response({ error: 'Sign in to manage a mailbox.' }, 401, origin, env)

  try {
    if (request.method === 'GET' && url.pathname === '/mailboxes') {
      const organizationId = url.searchParams.get('organizationId') ?? ''
      if (!uuidPattern.test(organizationId)) return response({ error: 'A valid workspace is required.' }, 400, origin, env)
      const membership = await getMembership(env, organizationId, identity.id)
      if (!membership) return response({ error: 'You do not belong to this workspace.' }, 403, origin, env)
      const query = new URL(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/mailbox_accounts`)
      query.searchParams.set('select', 'id,owner_id,provider_key,email_address,display_name,connection_state,last_sync_at,last_error_code,created_at,imap_host,imap_port,imap_tls_mode,smtp_host,smtp_port,smtp_tls_mode')
      query.searchParams.set('organization_id', `eq.${organizationId}`)
      query.searchParams.set('disconnected_at', 'is.null')
      if (!['super_admin', 'sales_manager'].includes(membership.role)) query.searchParams.set('owner_id', `eq.${identity.id}`)
      query.searchParams.set('order', 'created_at.desc')
      query.searchParams.set('limit', '100')
      const result = await fetch(query, { headers: serviceHeaders(env) })
      if (!result.ok) return response({ error: 'Mailbox accounts could not be loaded.' }, 503, origin, env)
      return response({ mailboxes: await result.json() }, 200, origin, env)
    }

    if (request.method !== 'POST' || !['/mailboxes/test', '/mailboxes', '/mailboxes/sync', '/mailboxes/test-send', '/sequences/send', '/sequences/dispatch-due'].includes(url.pathname)) {
      return response({ error: 'Not found.' }, 404, origin, env)
    }
    if (url.pathname === '/sequences/send') {
      const rawText = await request.text()
      let value: unknown
      try { value = JSON.parse(rawText) } catch { return response({ error: 'Invalid request body.' }, 400, origin, env) }
      const body = value as { organizationId?: unknown; enrollmentId?: unknown }
      if (typeof body.organizationId !== 'string' || !uuidPattern.test(body.organizationId)) return response({ error: 'A valid workspace is required.' }, 400, origin, env)
      if (typeof body.enrollmentId !== 'string' || !uuidPattern.test(body.enrollmentId)) return response({ error: 'A valid enrollment is required.' }, 400, origin, env)
      const membership = await getMembership(env, body.organizationId, identity.id)
      if (!membership || !rolesAllowed.has(membership.role)) return response({ error: 'You do not have permission to send sequence email in this workspace.' }, 403, origin, env)
      const result = await sendSequenceStep(env, { organizationId: body.organizationId, enrollmentId: body.enrollmentId, actorId: identity.id })
      if (!result.ok) return response({ error: result.error, code: result.code }, result.status, origin, env)
      return response({ ok: true, enrollmentId: result.enrollmentId, contactEmail: result.contactEmail, stepPosition: result.stepPosition, unsubscribeUrl: result.unsubscribeUrl }, 200, origin, env)
    }

    if (url.pathname === '/sequences/dispatch-due') {
      const rawText = await request.text()
      let value: unknown = {}
      if (rawText.trim()) try { value = JSON.parse(rawText) } catch { value = {} }
      const body = value as { organizationId?: unknown; limit?: number }
      if (typeof body.organizationId !== 'string' || !uuidPattern.test(body.organizationId)) return response({ error: 'A valid workspace is required.' }, 400, origin, env)
      const membership = await getMembership(env, body.organizationId, identity.id)
      if (!membership || !rolesAllowed.has(membership.role)) return response({ error: 'You do not have permission to dispatch sequence email in this workspace.' }, 403, origin, env)

      const suppressed = await (async () => {
        return 0
      })()
      void suppressed

      // Claim up to N due enrollments
      const cap = Math.max(1, Math.min(5, typeof body.limit === 'number' ? body.limit : 5))
      const dueUrl = new URL(`${getBase(env)}/rest/v1/sequence_enrollments`)
      dueUrl.searchParams.set('select', 'id,next_run_at,state,sequence_id')
      dueUrl.searchParams.set('organization_id', `eq.${body.organizationId}`)
      dueUrl.searchParams.set('state', 'in.(active,pending)')
      dueUrl.searchParams.set('next_run_at', `lte.${nowSql()}`)
      dueUrl.searchParams.set('order', 'next_run_at.asc')
      dueUrl.searchParams.set('limit', String(cap))
      const dueRes = await fetch(dueUrl, { headers: serviceHeaders(env) })
      const due = dueRes.ok ? (await dueRes.json() as Array<{ id: string }>) : []
      let succeeded = 0, retried = 0, failed = 0, results: Array<{ id: string; ok: boolean; error?: string }> = []
      for (const item of due) {
        const result = await sendSequenceStep(env, { organizationId: body.organizationId, enrollmentId: item.id, actorId: identity.id })
        // Configuration states (archived sequence, no sender, not an email step, bad address)
        // are not send failures — don't bounce Slack or KPIs on them.
        const skippedCodes = new Set(['suppressed', 'no_due_step', 'not_active', 'no_template', 'sequence_not_active', 'no_sender_mailbox', 'mailbox_not_connected', 'no_email', 'not_email'])
        if (result.ok) { succeeded += 1 }
        else if (result.code && skippedCodes.has(result.code)) {
          retried += 1
        } else { failed += 1 }
        results.push({ id: item.id, ok: result.ok, error: result.ok ? undefined : `${result.error}${result.code ? ' (' + result.code + ')' : ''}` })
      }
      // No Slack ping per dispatch — it fired on every browser visit and re-click, which spammed the channel.
      // Per-item outcomes are returned in `results` for the UI instead.
      return response({ ok: true, claimed: due.length, succeeded, retried, failed, results, dispatched_at: nowSql() }, 200, origin, env)
    }
    if (url.pathname === '/mailboxes/sync') {
      const rawText = await request.text()
      let value: unknown
      try { value = JSON.parse(rawText) } catch { return response({ error: 'Invalid request body.' }, 400, origin, env) }
      const body = value as { organizationId?: unknown; mailboxId?: unknown }
      if (typeof body.organizationId !== 'string' || !uuidPattern.test(body.organizationId)) return response({ error: 'A valid workspace is required.' }, 400, origin, env)
      if (typeof body.mailboxId !== 'string' || !uuidPattern.test(body.mailboxId)) return response({ error: 'A valid mailbox is required.' }, 400, origin, env)

      const isInternal = !!env.DISPATCH_TOKEN && request.headers.get('x-internal-cron-secret') === env.DISPATCH_TOKEN
      let membership: Membership | null = null
      if (!isInternal) {
        const maybe = await getMembership(env, body.organizationId, identity.id)
        if (!maybe || !rolesAllowed.has(maybe.role)) return response({ error: 'You do not have permission to sync a mailbox in this workspace.' }, 403, origin, env)
        membership = maybe
      } else {
        membership = { role: 'super_admin' }
      }

      if (!isInternal) {
        const ownerCheckUrl = new URL(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/mailbox_accounts`)
        ownerCheckUrl.searchParams.set('select', 'owner_id')
        ownerCheckUrl.searchParams.set('id', `eq.${body.mailboxId}`)
        ownerCheckUrl.searchParams.set('organization_id', `eq.${body.organizationId}`)
        ownerCheckUrl.searchParams.set('limit', '1')
        const ownerRes = await fetch(ownerCheckUrl, { headers: serviceHeaders(env) })
        const ownerRows = ownerRes.ok ? await ownerRes.json() as Array<{ owner_id: string }> : []
        const owner = ownerRows[0]?.owner_id
        if (owner && owner !== identity.id && !['super_admin', 'sales_manager'].includes(membership.role)) {
          return response({ error: 'You do not own this mailbox.' }, 403, origin, env)
        }
      }

      try {
        const result = await runMailboxSync(env, body.organizationId, body.mailboxId as string)
        return response(result, 200, origin, env)
      } catch (error) {
        const message = error instanceof Error ? error.message : 'sync_failed'
        return response({ error: message }, 503, origin, env)
      }
    }

    if (url.pathname === '/mailboxes/test-send') {
      const rawText = await request.text()
      let value: unknown
      try { value = JSON.parse(rawText) } catch { return response({ error: 'Invalid request body.' }, 400, origin, env) }
      const body = value as { organizationId?: unknown; mailboxId?: unknown; to?: unknown; subject?: unknown; text?: unknown }
      if (typeof body.organizationId !== 'string' || !uuidPattern.test(body.organizationId)) return response({ error: 'A valid workspace is required.' }, 400, origin, env)
      if (typeof body.mailboxId !== 'string' || !uuidPattern.test(body.mailboxId)) return response({ error: 'A valid mailbox is required.' }, 400, origin, env)
      if (typeof body.to !== 'string' || !/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(body.to)) return response({ error: 'A valid recipient is required.' }, 400, origin, env)
      const subject = typeof body.subject === 'string' ? body.subject.trim().slice(0, 300) : 'EIDEN Reach test message'
      const text = typeof body.text === 'string' ? body.text.slice(0, 20000) : 'This is a controlled SMTP verification message from EIDEN Reach.'
      const membership = await getMembership(env, body.organizationId, identity.id)
      if (!membership || !rolesAllowed.has(membership.role)) return response({ error: 'You do not have permission to send from this mailbox.' }, 403, origin, env)

      const accountUrl = new URL(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/mailbox_accounts`)
      accountUrl.searchParams.set('select', 'id,organization_id,owner_id,email_address')
      accountUrl.searchParams.set('id', `eq.${body.mailboxId}`)
      accountUrl.searchParams.set('organization_id', `eq.${body.organizationId}`)
      accountUrl.searchParams.set('limit', '1')
      const accountRes = await fetch(accountUrl, { headers: serviceHeaders(env) })
      if (!accountRes.ok) return response({ error: 'Mailbox could not be loaded.' }, 503, origin, env)
      const accounts = await accountRes.json() as Array<{ id: string; organization_id: string; owner_id: string; email_address: string }>
      const account = accounts[0]
      if (!account) return response({ error: 'Mailbox not found.' }, 404, origin, env)
      if (account.owner_id !== identity.id && !['super_admin', 'sales_manager'].includes(membership.role)) return response({ error: 'You do not own this mailbox.' }, 403, origin, env)

      const credUrl = new URL(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/mailbox_credential_refs`)
      credUrl.searchParams.set('select', 'key_version,nonce,credential_ciphertext')
      credUrl.searchParams.set('mailbox_account_id', `eq.${body.mailboxId}`)
      credUrl.searchParams.set('limit', '1')
      const credRes = await fetch(credUrl, { headers: serviceHeaders(env) })
      if (!credRes.ok) return response({ error: 'Mailbox credentials could not be loaded.' }, 503, origin, env)
      const creds = await credRes.json() as Array<{ key_version: string; nonce: string; credential_ciphertext: string }>
      const cred = creds[0]
      if (!cred) return response({ error: 'Mailbox credentials are missing.' }, 404, origin, env)

      let password: string
      try {
        password = await decryptCredentials(env, account.organization_id, account.email_address, { key_version: cred.key_version, nonce: cred.nonce, ciphertext: cred.credential_ciphertext })
      } catch {
        return response({ error: 'Mailbox credentials could not be decrypted.' }, 503, origin, env)
      }

      try {
        const result = await sendSmtpEmail({ address: account.email_address, password, from: account.email_address, to: body.to, subject, text })
        return response({ ok: true, mailboxId: body.mailboxId, recipient: body.to, port: result.port, tlsMode: result.tlsMode, message: 'Message accepted by SMTP.' }, 200, origin, env)
      } catch (error) {
        const code = error instanceof MailboxProtocolError ? error.code : 'send_failed'
        return response({ error: 'Message could not be sent.', code }, 422, origin, env)
      }
    }

    const input = await parseInput(request)
    if (!input) return response({ error: 'Enter a valid email, workspace, and mailbox password.' }, 400, origin, env)
    const membership = await getMembership(env, input.organizationId, identity.id)
    if (!membership || !rolesAllowed.has(membership.role)) return response({ error: 'You do not have permission to connect a mailbox in this workspace.' }, 403, origin, env)
    if (url.pathname === '/mailboxes' && (!env.MAILBOX_ENCRYPTION_KEY || !env.MAILBOX_ENCRYPTION_KEY_VERSION)) {
      return response({ error: 'Mailbox credential encryption is not configured on the server.' }, 503, origin, env)
    }
    if (!await reserveConnectionTest(env, input.organizationId, identity.id)) {
      return response({ error: 'Connection test limit reached. Wait before testing this mailbox again.' }, 429, origin, env)
    }

    let verified
    try { verified = await verifyMailboxCredentials(input.email, input.password) }
    catch (error) { const safe = publicTestError(error); return response({ error: safe.message, code: safe.code }, 422, origin, env) }
    if (url.pathname === '/mailboxes/test') return response({ ok: true, imap: { status: 'authenticated', port: verified.imapPort, tlsMode: verified.imapTlsMode }, smtp: { status: 'authenticated', host: 'smtp.hostinger.com', port: verified.smtpPort, tlsMode: verified.smtpTlsMode } }, 200, origin, env)

    const envelope = await encryptCredentials(env, input)
    const mailboxId = await rpc<string>(env, 'create_mailbox_account', {
      target_organization: input.organizationId,
      acting_user: identity.id,
      target_email: input.email,
      target_display_name: input.displayName || null,
      target_smtp_port: verified.smtpPort,
      target_smtp_tls_mode: verified.smtpTlsMode,
      target_key_version: envelope.keyVersion,
      target_nonce: envelope.nonce,
      target_ciphertext: envelope.ciphertext,
    })
    return response({ ok: true, mailboxId, email: input.email, connectionState: 'connected', syncState: 'not_started' }, 201, origin, env)
  } catch (error) {
    return response({ error: 'Mailbox operation could not be completed.', code: error instanceof Error ? error.message : 'unknown' }, 503, origin, env)
  }
}

export default {
  fetch(request: Request, env: Env): Promise<Response> { return handle(request, env) },
  scheduled(_controller: ScheduledController, env: Env, context: ExecutionContext): void {
    context.waitUntil(
      (async () => {
        const token = env.DISPATCH_TOKEN ?? ''
        if (!token) return
        // sync inbound every 5 minutes: ensures replies/bounces are detected even when no browser is open
        try {
          const sync = await fetch('http://127.0.0.1:8787/system/mailbox-sync-all', {
            method: 'POST',
            headers: { 'x-dispatch-secret': token, 'content-type': 'application/json' },
          })
          console.log('SYSTEM_MAILBOX_SYNC_RESULT', sync.status, await sync.text().catch(() => ''))
        } catch (error) { console.error('SYSTEM_MAILBOX_SYNC_FAILED', error) }
        try {
          const result = await fetch('http://127.0.0.1:8787/system/dispatch-due', {
            method: 'POST',
            headers: { 'x-dispatch-secret': token, 'content-type': 'application/json' },
          })
          console.log('SYSTEM_DISPATCH_RESULT', result.status, await result.text().catch(() => ''))
        } catch (error) {
          console.error('SYSTEM_DISPATCH_FAILED', error)
        }
      })()
    )
  },
}

type ScheduledController = { cron: string; scheduledTime: number; noRetry(): void }
type ExecutionContext = { waitUntil(promise: Promise<unknown>): void }
