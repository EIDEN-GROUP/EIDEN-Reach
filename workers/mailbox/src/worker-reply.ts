import type { Env } from './runtime'
import { serviceHeaders } from './runtime'

export async function notifySlack(webhook: string | undefined, text: string): Promise<void> {
  if (!webhook) return
  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    })
  } catch (error) {
    console.error('SLACK_NOTIFY_FAILED', error)
  }
}

export async function processBounceMessage(env: Env, organizationId: string, participants: Array<{ participant_type: string; email_address: string }>, subject: string | null | undefined, rawHeaders: unknown): Promise<number> {
  try {
    const from = participants.find(p => p.participant_type === 'from')?.email_address?.trim().toLowerCase() || ''
    const isBounce = /mailer-daemon|postmaster|mail-daemon|mail system/i.test(from) || /delivery status notification|undeliverable|mail delivery failed/i.test(subject ?? '')
    if (!isBounce) return 0
    const headerText = typeof rawHeaders === 'string' ? rawHeaders : JSON.stringify(rawHeaders ?? {})
    const recipients = new Set<string>()
    for (const regex of [
      /final-recipient:\s*rfc822;\s*([^\s;]+)/gi,
      /original-recipient:\s*rfc822;\s*([^\s;]+)/gi,
      /X-Failed-Recipients:\s*([^\r\n]+)/gi,
      /Envelope-To:\s*([^\r\n]+)/gi,
    ]) {
      let match: RegExpExecArray | null
      while ((match = regex.exec(headerText)) !== null) {
        match[1].split(/[\s,;]+/).forEach(item => {
          const cleaned = item.trim().replace(/[<>]/g, '').toLowerCase()
          if (cleaned.includes('@')) recipients.add(cleaned)
        })
      }
    }
    if (recipients.size === 0 && from.includes('daemon')) {
      const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g
      for (const email of (subject ?? '').match(emailRegex) ?? []) recipients.add(email.toLowerCase())
    }
    if (recipients.size === 0) return 0
    const now = new Date().toISOString()
    let stopped = 0
    for (const recipientEmail of recipients) {
      const contactId = await findContactIdByEmail(env, organizationId, recipientEmail)
      if (!contactId) continue
      const enrollments = await (async () => {
        const q = new URL(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/sequence_enrollments`)
        q.searchParams.set('select', 'id,sequence_id')
        q.searchParams.set('organization_id', `eq.${organizationId}`)
        q.searchParams.set('contact_id', `eq.${contactId}`)
        q.searchParams.set('state', 'in.(pending,active,waiting,sending,paused)')
        q.searchParams.set('limit', '100')
        const r = await fetch(q, { headers: serviceHeaders(env) })
        if (!r.ok) return []
        return r.json() as Promise<Array<{ id: string; sequence_id: string }>>
      })()
      if (!enrollments.length) continue
      const patchRes = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/sequence_enrollments?organization_id=eq.${organizationId}&contact_id=eq.${contactId}&state=in.(pending,active,waiting,sending,paused)`, {
        method: 'PATCH',
        headers: { ...serviceHeaders(env, true), Prefer: 'return=minimal' },
        body: JSON.stringify({ state: 'bounced', stopped_at: now, stop_reason: 'email_bounce', next_run_at: null }),
      })
      if (!patchRes.ok) continue
      for (const enrollment of enrollments) {
        await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/activity_events`, {
          method: 'POST',
          headers: { ...serviceHeaders(env, true), Prefer: 'return=minimal' },
          body: JSON.stringify({
            organization_id: organizationId,
            actor_id: null,
            contact_id: contactId,
            company_id: null,
            deal_id: null,
            task_id: null,
            event_type: 'sequence_email_bounced',
            summary: `Bounced recipient ${recipientEmail} (delivery notice from ${from}).`,
            occurred_at: now,
            source: 'mailbox_sync',
            idempotency_key: `bounce:${organizationId}:${enrollment.id}:${recipientEmail}`,
            metadata: { mailer_address: from, subject: subject ?? null },
          }),
        }).catch(err => console.error('BOUNCE_ACTIVITY_FAILED', err))
      }
      await notifySlack((env as unknown as { SLACK_WEBHOOK_URL?: string }).SLACK_WEBHOOK_URL, `Bounced recipient ${recipientEmail}. Sequence enrollments stopped.`)
      stopped += enrollments.length
    }
    return stopped
  } catch (error) {
    console.error('BOUNCE_PROCESS_ERROR', error)
    return 0
  }
}
export async function stopEnrollmentsForReply(env: Env, organizationId: string, participants: Array<{ participant_type: string; email_address: string }>, inReplyTo: string | null, references: string[]): Promise<number> {
  try {
    const from = participants.find(p => p.participant_type === 'from')?.email_address?.trim().toLowerCase()
    if (!from) return 0
    const contactId = await findContactIdByEmail(env, organizationId, from)
    if (!contactId) return 0
    return await stopEnrollmentsForContact(env, organizationId, contactId, from, inReplyTo, references)
  } catch (error) {
    console.error('REPLY_STOP_ERROR', error)
    return 0
  }
}

async function findContactIdByEmail(env: Env, organizationId: string, email: string): Promise<string | null> {
  const contactUrl = new URL(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/contacts`)
  contactUrl.searchParams.set('select', 'id')
  contactUrl.searchParams.set('organization_id', `eq.${organizationId}`)
  contactUrl.searchParams.set('email', `eq.${email}`)
  contactUrl.searchParams.set('limit', '1')
  const res = await fetch(contactUrl, { headers: serviceHeaders(env) })
  if (!res.ok) return null
  const rows = await res.json() as Array<{ id: string }>
  return rows[0]?.id ?? null
}

async function stopEnrollmentsForContact(env: Env, organizationId: string, contactId: string, from: string, inReplyTo: string | null, references: string[]): Promise<number> {
  const enrollmentUrl = new URL(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/sequence_enrollments`)
  enrollmentUrl.searchParams.set('select', 'id,sequence_id')
  enrollmentUrl.searchParams.set('organization_id', `eq.${organizationId}`)
  enrollmentUrl.searchParams.set('contact_id', `eq.${contactId}`)
  enrollmentUrl.searchParams.set('state', 'in.(pending,active,waiting,sending,paused)')
  enrollmentUrl.searchParams.set('limit', '100')
  const enrollRes = await fetch(enrollmentUrl, { headers: serviceHeaders(env) })
  if (!enrollRes.ok) return 0
  const enrollments = await enrollRes.json() as Array<{ id: string; sequence_id: string }>
  if (!enrollments.length) return 0

  const patchUrl = `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/sequence_enrollments?organization_id=eq.${organizationId}&contact_id=eq.${contactId}&state=in.(pending,active,waiting,sending,paused)`
  const stoppedAt = new Date().toISOString()
  const patchRes = await fetch(patchUrl, {
    method: 'PATCH',
    headers: { ...serviceHeaders(env, true), Prefer: 'return=minimal' },
    body: JSON.stringify({ state: 'replied', stopped_at: stoppedAt, stop_reason: 'reply_received', next_run_at: null }),
  })
  if (!patchRes.ok) return 0

  for (const enrollment of enrollments) {
    const insertRes = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/activity_events`, {
      method: 'POST',
      headers: { ...serviceHeaders(env, true), Prefer: 'return=minimal' },
      body: JSON.stringify({
        organization_id: organizationId,
        actor_id: null,
        contact_id: contactId,
        company_id: null,
        deal_id: null,
        task_id: null,
        event_type: 'sequence.reply_received',
        summary: `Sequence enrollment ${enrollment.id} stopped after reply from ${from}`,
        occurred_at: stoppedAt,
        source: 'mailbox_sync',
        idempotency_key: `reply:${organizationId}:${enrollment.id}:${from}`,
        metadata: { in_reply_to: inReplyTo ?? null, references },
      }),
    })
    if (!insertRes.ok) console.error('ACTIVITY_EVENT_FAILED', insertRes.statusText)

    await notifySlack((env as unknown as { SLACK_WEBHOOK_URL?: string }).SLACK_WEBHOOK_URL, `Reply received from ${from}. Sequence paused enrollment ${enrollment.id}.`)
  }
  return enrollments.length
}

export async function reconcileReplyStoppedEnrollments(env: Env, organizationId: string, mailboxAccountId: string): Promise<number> {
  try {
    const enrollmentUrl = new URL(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/sequence_enrollments`)
    enrollmentUrl.searchParams.set('select', 'id,contact_id,enrolled_at,state')
    enrollmentUrl.searchParams.set('organization_id', `eq.${organizationId}`)
    enrollmentUrl.searchParams.set('state', 'in.(pending,active,waiting,sending,paused)')
    enrollmentUrl.searchParams.set('limit', '100')
    const enrollRes = await fetch(enrollmentUrl, { headers: serviceHeaders(env) })
    if (!enrollRes.ok) return 0
    const enrollments = await enrollRes.json() as Array<{ id: string; contact_id: string; enrolled_at: string; state: string }>
    if (!enrollments.length) return 0

    let stopped = 0
    for (const enrollment of enrollments) {
      const contactUrl = new URL(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/contacts`)
      contactUrl.searchParams.set('select', 'email')
      contactUrl.searchParams.set('id', `eq.${enrollment.contact_id}`)
      contactUrl.searchParams.set('limit', '1')
      const contactRes = await fetch(contactUrl, { headers: serviceHeaders(env) })
      if (!contactRes.ok) continue
      const contacts = await contactRes.json() as Array<{ email: string | null }>
      const email = contacts[0]?.email?.trim().toLowerCase()
      if (!email) continue

      const messageUrl = new URL(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/email_messages`)
      messageUrl.searchParams.set('select', 'id,received_at')
      messageUrl.searchParams.set('mailbox_account_id', `eq.${mailboxAccountId}`)
      messageUrl.searchParams.set('direction', 'eq.inbound')
      messageUrl.searchParams.set('received_at', `gte.${enrollment.enrolled_at}`)
      messageUrl.searchParams.set('limit', '50')
      const messageRes = await fetch(messageUrl, { headers: serviceHeaders(env) })
      if (!messageRes.ok) continue
      const messages = await messageRes.json() as Array<{ id: string }>
      if (!messages.length) continue

      const participantUrl = new URL(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/email_message_participants`)
      participantUrl.searchParams.set('select', 'message_id')
      participantUrl.searchParams.set('message_id', `in.(${messages.map(m => m.id).join(',')})`)
      participantUrl.searchParams.set('participant_type', 'eq.from')
      participantUrl.searchParams.set('email_address', `eq.${email}`)
      participantUrl.searchParams.set('limit', '1')
      const participantRes = await fetch(participantUrl, { headers: serviceHeaders(env) })
      if (!participantRes.ok) continue
      const participants = await participantRes.json() as Array<{ message_id: string }>
      if (!participants.length) continue

      const stoppedCount = await stopEnrollmentsForContact(env, organizationId, enrollment.contact_id, email, null, [])
      stopped += stoppedCount
    }
    return stopped
  } catch (error) {
    console.error('REPLY_RECONCILE_ERROR', error)
    return 0
  }
}
