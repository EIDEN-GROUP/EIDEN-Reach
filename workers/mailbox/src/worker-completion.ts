import type { Env } from './runtime'
import { serviceHeaders } from './runtime'
import { notifySlack } from './worker-slack'

const OPEN_STATES = 'pending,active,waiting,sending,paused'

function base(env: Env): string {
  return (env.SUPABASE_URL || '').replace(/\/$/, '')
}

function formatWhen(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

/**
 * Post a Slack message when a sequence's last open enrollment finishes —
 * and do it exactly once per sequence (marker row in audit_logs).
 * Open = still able to send (pending/active/waiting/sending/paused).
 * Completed = every enrollment reached a terminal state (completed, replied,
 * interested, unsubscribed, bounced, cancelled, failed).
 */
export async function maybeNotifySequenceCompleted(
  env: Env,
  input: { organizationId: string; sequenceId: string },
): Promise<void> {
  try {
    const webhook = (env as unknown as { SLACK_WEBHOOK_URL?: string }).SLACK_WEBHOOK_URL
    if (!webhook) return
    const { sequenceId, organizationId } = input

    // 1) Sequence must be active — drafts/archived sequences never "complete"
    const seqRes = await fetch(`${base(env)}/rest/v1/sequences?select=name,owner_id,created_at,status&id=eq.${sequenceId}&limit=1`, { headers: serviceHeaders(env) })
    const seqRows = seqRes.ok ? (await seqRes.json() as Array<{ name: string; owner_id: string | null; created_at: string; status: string }>) : []
    const sequence = seqRows[0]
    if (!sequence || sequence.status !== 'active') return

    // 2) Any enrollment still able to send? Then it has not completed.
    const openRes = await fetch(`${base(env)}/rest/v1/sequence_enrollments?select=id&sequence_id=eq.${sequenceId}&state=in.(${OPEN_STATES})&limit=1`, { headers: serviceHeaders(env) })
    const openRows = openRes.ok ? (await openRes.json() as Array<{ id: string }>) : [{ id: 'unknown' }]
    if (openRows.length > 0) return

    // 3) Already announced? (idempotency marker in audit_logs)
    const markerRes = await fetch(`${base(env)}/rest/v1/audit_logs?select=id&action=eq.sequence.completed&resource_type=eq.sequence&resource_id=eq.${sequenceId}&limit=1`, { headers: serviceHeaders(env) })
    const markerRows = markerRes.ok ? (await markerRes.json() as Array<{ id: string }>) : [{ id: 'unknown' }]
    if (markerRows.length > 0) return

    // 4) Shape the message with real numbers
    const enrollRes = await fetch(`${base(env)}/rest/v1/sequence_enrollments?select=id,state,stop_reason,enrolled_at,stopped_at&sequence_id=eq.${sequenceId}&limit=2000`, { headers: serviceHeaders(env) })
    const enrollments = enrollRes.ok ? (await enrollRes.json() as Array<{ state: string; stop_reason: string | null; enrolled_at: string; stopped_at: string | null }>) : []
    const total = enrollments.length
    if (total === 0) return
    const firstStart = enrollments.map(e => e.enrolled_at).filter(Boolean).sort()[0] ?? sequence.created_at
    const completedAt = enrollments.map(e => e.stopped_at).filter((v): v is string => Boolean(v)).sort().at(-1) ?? new Date().toISOString()
    const breakdownMap: Record<string, number> = {}
    for (const e of enrollments) {
      const key = (e.stop_reason ?? e.state).replaceAll('_', ' ')
      breakdownMap[key] = (breakdownMap[key] ?? 0) + 1
    }
    const breakdown = Object.entries(breakdownMap).map(([k, v]) => `${v} ${k}`).join(', ')

    // 5) Who started it
    let starter = sequence.owner_id ?? 'unknown'
    if (sequence.owner_id) {
      const profRes = await fetch(`${base(env)}/rest/v1/profiles?select=display_name,email&id=eq.${sequence.owner_id}&limit=1`, { headers: serviceHeaders(env) })
      const profRows = profRes.ok ? (await profRes.json() as Array<{ display_name: string | null; email: string | null }>) : []
      starter = profRows[0]?.display_name || profRows[0]?.email || sequence.owner_id
    }

    await notifySlack(webhook, `✅ Sequence "${sequence.name}" completed — started by ${starter} on ${formatWhen(firstStart)}. All ${total} enrollment${total === 1 ? '' : 's'} finished (${breakdown}) on ${formatWhen(completedAt)}.`)

    // 6) Mark announced — this doubles as the audit record for the completion
    await fetch(`${base(env)}/rest/v1/audit_logs`, {
      method: 'POST',
      headers: { ...serviceHeaders(env, true), Prefer: 'return=minimal' },
      body: JSON.stringify({
        organization_id: organizationId,
        actor_id: sequence.owner_id ?? null,
        action: 'sequence.completed',
        resource_type: 'sequence',
        resource_id: sequenceId,
        result: 'success',
        details: { total, first_start: firstStart, completed_at: completedAt, breakdown: breakdownMap },
      }),
    }).catch(err => console.error('SEQUENCE_COMPLETE_AUDIT_FAILED', err))
  } catch (error) {
    console.error('SEQUENCE_COMPLETION_CHECK_FAILED', error)
  }
}
