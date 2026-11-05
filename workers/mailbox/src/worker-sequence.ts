import type { Env } from './runtime'
import { serviceHeaders } from './runtime'
import { decryptCredentials } from './worker-crypto'
import { sendSmtpEmail, MailboxProtocolError } from './protocols'

function getBase(env: Env): string {
  return env.SUPABASE_URL.replace(/\/$/, '')
}

async function rest<T>(env: Env, path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${getBase(env)}/rest/v1/${path}`, {
    ...init,
    headers: {
      ...serviceHeaders(env),
      ...(init?.headers ?? {}),
    },
  })
  if (!response.ok) {
    const detail = await response.text().catch(() => '')
    throw new Error(`rest_${path}_${response.status}: ${detail.slice(0, 300)}`)
  }
  const text = await response.text()
  if (!text) return undefined as T
  return JSON.parse(text) as T
}

async function notifySlack(webhookUrl: string | undefined, message: string) {
  if (!webhookUrl) return
  try {
    await fetch(webhookUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: message }) })
  } catch (error) {
    console.error('SLACK_NOTIFY_FAILED', error)
  }
}

export type UnsubscribeResult =
  | { ok: true; message: string }
  | { ok: false; status: number; error: string }

export async function handleUnsubscribe(env: Env, token: string): Promise<UnsubscribeResult> {
  if (!token || !/^[a-zA-Z0-9_-]{8,200}$/.test(token)) {
    return { ok: false, status: 400, error: 'Invalid unsubscribe link.' }
  }

  const tokens = await rest<Array<{ id: string; organization_id: string; contact_id: string; enrollment_id: string | null; sequence_id: string | null }>>(
    env, `unsubscribe_tokens?select=id,organization_id,contact_id,enrollment_id,sequence_id&token=eq.${encodeURIComponent(token)}&limit=1`)
  const record = tokens[0]
  if (!record) return { ok: false, status: 404, error: 'This unsubscribe link is invalid or has expired.' }
  if (record.enrollment_id) {
    const stoppedAt = new Date().toISOString()
    await rest(env, `sequence_enrollments?id=eq.${record.enrollment_id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal', 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'unsubscribed', stopped_at: stoppedAt, stop_reason: 'unsubscribe', next_run_at: null }),
    })
  }

  // stop every other pending/active/paused enrollment for this contact in this workspace
  const pausedStates = ['pending', 'active', 'waiting', 'sending', 'paused']
  await rest(env, `sequence_enrollments?organization_id=eq.${record.organization_id}&contact_id=eq.${record.contact_id}&state=in.(${pausedStates.join(',')})`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal', 'Content-Type': 'application/json' },
    body: JSON.stringify({ state: 'unsubscribed', stopped_at: new Date().toISOString(), stop_reason: 'unsubscribe', next_run_at: null }),
  })

  const contacts = await rest<Array<{ email: string | null }>>(
    env, `contacts?select=email&id=eq.${record.contact_id}&limit=1`)
  const email = contacts[0]?.email?.toLowerCase()
  if (email) {
    await rest(env, 'suppression_records', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates,return=minimal', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        organization_id: record.organization_id,
        contact_id: record.contact_id,
        email_normalized: email,
        reason: 'unsubscribe',
        source: 'sequence_unsubscribe',
      }),
    })
  }

  await rest(env, 'activity_events', {
    method: 'POST',
    headers: { Prefer: 'return=minimal', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      organization_id: record.organization_id,
      contact_id: record.contact_id,
      event_type: 'sequence_unsubscribe',
      summary: 'Contact unsubscribed via email link; all active enrollments stopped.',
      source: 'worker.unsubscribe',
    }),
  })

  await notifySlack((env as unknown as { SLACK_WEBHOOK_URL?: string }).SLACK_WEBHOOK_URL, `Unsubscribe: ${email ?? 'contact'} opted out via email link. All active enrollments stopped.`)

  await rest(env, `unsubscribe_tokens?id=eq.${record.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal', 'Content-Type': 'application/json' },
    body: JSON.stringify({ used_at: new Date().toISOString() }),
  })

  return { ok: true, message: 'You have been unsubscribed. You will not receive further sequence emails from this organization.' }
}

export function unsubscribeConfirmationHtml(message: string, ok: boolean): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Unsubscribe</title></head><body style="font-family:system-ui;min-height:100vh;display:flex;align-items:center;justify-content:center"><main style="max-width:440px;padding:32px;border:1px solid #e5e7eb;border-radius:12px;text-align:center"><h1 style="margin:0 0 8px">${ok ? 'Unsubscribed' : 'Unable to unsubscribe'}</h1><p style="color:#4b5563">${message}</p></main></body></html>`
}

export function buildUnsubscribeUrl(env: Env, props: { token: string }): string {
  const base = (env as unknown as { UNSUBSCRIBE_URL_BASE?: string }).UNSUBSCRIBE_URL_BASE || 'http://127.0.0.1:8787'
  return `${base}/unsubscribe?token=${props.token}`
}

export function isSuppressed(env: Env, organizationId: string, email: string): Promise<boolean> {
  return (async () => {
    const rows = await rest<Array<{ id: string }>>(
      env, `suppression_records?select=id&organization_id=eq.${organizationId}&email_normalized=eq.${encodeURIComponent(email.toLowerCase())}&limit=1`)
    return rows.length > 0
  })()
}

export async function createUnsubscribeToken(env: Env, props: {
  organizationId: string
  contactId: string
  enrollmentId?: string | null
  sequenceId?: string | null
  stepPosition?: number | null
  senderMailboxId?: string | null
}): Promise<string> {
  const randomBytes = new Uint8Array(18)
  crypto.getRandomValues(randomBytes)
  const token = Array.from(randomBytes, byte => byte.toString(16).padStart(2, '0')).join('')
  await rest(env, 'unsubscribe_tokens', {
    method: 'POST',
    headers: { Prefer: 'return=minimal', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      organization_id: props.organizationId,
      token,
      contact_id: props.contactId,
      enrollment_id: props.enrollmentId ?? null,
      sequence_id: props.sequenceId ?? null,
      step_position: props.stepPosition ?? null,
      sender_mailbox_id: props.senderMailboxId ?? null,
    }),
  })
  return token
}

export function applyUnsubscribeMergeFields(html: string, text: string, link: string): { html: string; text: string } {
  const buttonHtml = `<a href="${link}" style="display:inline-block;padding:8px 16px;border:1px solid #9ca3af;border-radius:8px;color:#1f2937;text-decoration:none;font-size:13px;">Unsubscribe</a>`
  let finalHtml = html
    .replaceAll('{{unsubscribe_link}}', link)
    .replaceAll('{{UNSUBSCRIBE_LINK}}', link)
    .replaceAll('{{unsubscribe_button}}', buttonHtml)
    .replaceAll('{{UNSUBSCRIBE_BUTTON}}', buttonHtml)
  const finalText = text
    .replaceAll('{{unsubscribe_link}}', link)
    .replaceAll('{{UNSUBSCRIBE_LINK}}', link)
    .replaceAll('{{unsubscribe_button}}', `Unsubscribe: ${link}`)
    .replaceAll('{{UNSUBSCRIBE_BUTTON}}', `Unsubscribe: ${link}`)

  const hasManual = html.includes('unsubscribe_link') || html.includes('UNSUBSCRIBE_LINK') || html.includes('unsubscribe_button') || html.includes('UNSUBSCRIBE_BUTTON')
  if (!hasManual) {
    const footer = `<p style="font-size:12px;color:#6b7280;margin-top:24px;border-top:1px solid #e5e7eb;padding-top:12px">You received this email because you are on our outreach list. ${buttonHtml}</p>`
    finalHtml = `${finalHtml}${footer}`
  }
  return { html: finalHtml, text: finalText }
}

export type SequenceSendResult =
  | { ok: true; enrollmentId: string; contactEmail: string; stepPosition: number; unsubscribeUrl: string }
  | { ok: false; status: number; error: string; code?: string }

export async function sendSequenceStep(env: Env, input: { organizationId: string; enrollmentId: string; actorId: string }): Promise<SequenceSendResult> {
  const enrollments = await rest<Array<{ id: string; organization_id: string; sequence_id: string; sequence_version: number; contact_id: string; state: string; next_step_position: number }>>(
    env, `sequence_enrollments?select=id,organization_id,sequence_id,sequence_version,contact_id,state,next_step_position&id=eq.${input.enrollmentId}&limit=1`)
  const enrollment = enrollments[0]
  if (!enrollment) return { ok: false, status: 404, error: 'Enrollment not found.' }
  if (enrollment.organization_id !== input.organizationId) return { ok: false, status: 403, error: 'Enrollment does not belong to this workspace.' }
  if (!['active', 'sending', 'waiting', 'pending'].includes(enrollment.state)) return { ok: false, status: 422, error: `This enrollment is ${enrollment.state}. Only active enrollments can receive email.`, code: 'not_active' }

  const seqRows = await rest<Array<{ id: string; name: string; status: string; sender_mailbox_id: string | null; daily_limit: number | null }>>(
    env, `sequences?select=id,name,status,sender_mailbox_id,daily_limit&id=eq.${enrollment.sequence_id}&limit=1`)
  const sequence = seqRows[0]
  if (!sequence) return { ok: false, status: 404, error: 'Sequence not found.' }
  if (sequence.status !== 'active') return { ok: false, status: 422, error: 'Only active sequences can send.', code: 'sequence_not_active' }
  if (!sequence.sender_mailbox_id) return { ok: false, status: 422, error: 'Sequence has no sender mailbox.', code: 'no_sender_mailbox' }

  const contactRows = await rest<Array<{ id: string; first_name: string; last_name: string | null; email: string | null; job_title: string | null; company_id: string | null }>>(
    env, `contacts?select=id,first_name,last_name,email,job_title,company_id&id=eq.${enrollment.contact_id}&limit=1`)
  const contact = contactRows[0]
  if (!contact || !contact.email) return { ok: false, status: 422, error: 'Contact has no email address.', code: 'no_email' }

  if (await isSuppressed(env, enrollment.organization_id, contact.email)) {
    await rest(env, `sequence_enrollments?id=eq.${enrollment.id}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal', 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: 'unsubscribed', stopped_at: new Date().toISOString(), stop_reason: 'unsubscribe', next_run_at: null }),
    })
    return { ok: false, status: 422, error: 'Contact is suppressed and cannot receive sequence email.', code: 'suppressed' }
  }

  const steps = await rest<Array<{ id: string; position: number; kind: string; delay_minutes: number; template_id: string | null }>>(
    env, `sequence_steps?select=id,position,kind,delay_minutes,template_id&sequence_id=eq.${enrollment.sequence_id}&version=eq.${enrollment.sequence_version}&order=position.asc`)
  const step = steps.find(s => s.position === enrollment.next_step_position)
  if (!step) return { ok: false, status: 422, error: 'No due step for this enrollment.', code: 'no_due_step' }
  if (step.kind !== 'email' || !step.template_id) return { ok: false, status: 422, error: 'This step is not an email step.', code: 'not_email' }

  const templates = await rest<Array<{ id: string; subject: string; html_body: string; text_body: string }>>(
    env, `email_templates?select=id,subject,html_body,text_body&id=eq.${step.template_id}&limit=1`)
  const template = templates[0]
  if (!template) return { ok: false, status: 422, error: 'Step template not found.', code: 'no_template' }

  const companyName = contact.company_id
    ? (await rest<Array<{ name: string | null }>>(env, `companies?select=name&id=eq.${contact.company_id}&limit=1`))[0]?.name ?? ''
    : ''

  const account = (await rest<Array<{ id: string; email_address: string; connection_state: string | null }>>(
    env, `mailbox_accounts?select=id,email_address,connection_state&id=eq.${sequence.sender_mailbox_id}&limit=1`))[0]
  if (!account) return { ok: false, status: 404, error: 'Sender mailbox not found.' }
  if (account.connection_state !== 'connected') return { ok: false, status: 422, error: 'Sender mailbox is not connected.', code: 'mailbox_not_connected' }

  const cred = (await rest<Array<{ key_version: string; nonce: string; credential_ciphertext: string }>>(
    env, `mailbox_credential_refs?select=key_version,nonce,credential_ciphertext&mailbox_account_id=eq.${account.id}&limit=1`))[0]
  if (!cred) return { ok: false, status: 404, error: 'Mailbox credentials missing.' }

  let password: string
  try {
    password = await decryptCredentials(env, enrollment.organization_id, account.email_address, { key_version: cred.key_version, nonce: cred.nonce, ciphertext: cred.credential_ciphertext })
  } catch {
    return { ok: false, status: 503, error: 'Mailbox credentials could not be decrypted.', code: 'credentials_decrypt_failed' }
  }

  const token = await createUnsubscribeToken(env, {
    organizationId: enrollment.organization_id,
    contactId: contact.id,
    enrollmentId: enrollment.id,
    sequenceId: enrollment.sequence_id,
    stepPosition: step.position,
    senderMailboxId: account.id,
  })
  const unsubscribeUrl = buildUnsubscribeUrl(env, { token })
  const merge = (value: string) => value
    .replaceAll('{{first_name}}', contact.first_name ?? '')
    .replaceAll('{{last_name}}', contact.last_name ?? '')
    .replaceAll('{{company}}', companyName)
    .replaceAll('{{email}}', contact.email ?? '')
    .replaceAll('{{job_title}}', contact.job_title ?? '')

  const firstName = contact.first_name ?? ''
  const lastName = contact.last_name ?? ''
  const plainText = merge(template.text_body || template.html_body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
  const htmlWithTags = merge(template.html_body || `<p>${escapeHtml(plainText)}</p>`)
  const merged = applyUnsubscribeMergeFields(htmlWithTags, plainText, unsubscribeUrl)

  try {
    await sendSmtpEmail({
      address: account.email_address,
      password,
      from: account.email_address,
      to: contact.email,
      subject: merge(template.subject),
      text: merged.text,
      html: merged.html,
      listUnsubscribe: [unsubscribeUrl],
    })
  } catch (error) {
    const code = error instanceof MailboxProtocolError ? error.code : 'send_failed'
    return { ok: false, status: 422, error: 'Email could not be sent.', code }
  }

  const now = new Date().toISOString()
  await rest(env, 'send_attempts', {
    method: 'POST',
    headers: { Prefer: 'return=minimal', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      organization_id: enrollment.organization_id,
      mailbox_account_id: account.id,
      enrollment_id: enrollment.id,
      sequence_step_id: step.id,
      contact_id: contact.id,
      idempotency_key: `seq-send-${enrollment.id}-${step.position}-${Date.now()}`,
      status: 'sent',
      started_at: now,
      finished_at: now,
    }),
  })

  const remaining = steps.filter(s => s.position > step.position)
  const nextStep = remaining[0] ?? null
  const nextRunAt = nextStep ? new Date(Date.now() + Math.max(1, nextStep.delay_minutes) * 60_000).toISOString() : null
  await rest(env, `sequence_enrollments?id=eq.${enrollment.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      next_step_position: nextStep ? nextStep.position : step.position + 1,
      next_run_at: nextRunAt,
      state: nextStep ? 'active' : 'completed',
      stopped_at: nextStep ? null : now,
      stop_reason: nextStep ? null : 'completed',
    }),
  })

  await rest(env, 'activity_events', {
    method: 'POST',
    headers: { Prefer: 'return=minimal', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      organization_id: enrollment.organization_id,
      contact_id: contact.id,
      event_type: 'sequence_email_sent',
      summary: `Sent step ${step.position + 1} of sequence to ${firstName} ${lastName}`.trim(),
      source: 'worker.sequence_send',
    }),
  })

  return { ok: true, enrollmentId: enrollment.id, contactEmail: contact.email, stepPosition: step.position, unsubscribeUrl }
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}
