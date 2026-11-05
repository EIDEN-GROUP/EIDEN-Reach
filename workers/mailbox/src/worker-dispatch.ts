import type { Env } from './runtime'
import { serviceHeaders } from './runtime'
import { decryptCredentials } from './worker-crypto'
import { sendSmtpEmail, MailboxProtocolError } from './protocols'
import { sendSequenceStep, createUnsubscribeToken, buildUnsubscribeUrl, handleUnsubscribe, applyUnsubscribeMergeFields, isSuppressed } from './worker-sequence'

async function runSystemDispatch(env: Env, limit: number): Promise<{claimed:number, succeeded:number, retried:number, failed:number, dispatched_at:string, results:Array<{id:string,ok:boolean,error?:string}>}> {
  const now = new Date().toISOString()
  const base = `${env.SUPABASE_URL.replace(/\/$/, '')}`
  const safe = (p:string) => new URL(`${base}/${p}`)

  // Get all organizations that potentially have due enrollments.
  const rows = await fetch(`${base}/rest/v1/sequence_enrollments?select=organization_id&next_run_at=lte.${encodeURIComponent(now)}&state=in.(active,pending)&limit=200`,
    { headers: serviceHeaders(env) })
  const orgs = rows.ok ? Array.from(new Set((await rows.json() as Array<{ organization_id:string }>).map(r => r.organization_id))) : []
  const cap = Math.max(1, Math.min(10, limit || 5))
  let succeeded=0,retried=0,failed=0,claimed=0
  const results: Array<{id:string,ok:boolean,error?:string}> = []

  for (const org of orgs) {
    const dueRes = await fetch(`${base}/rest/v1/sequence_enrollments?select=id&organization_id=eq.${org}&state=in.(active,pending)&next_run_at=lte.${encodeURIComponent(now)}&order=next_run_at.asc&limit=${cap}`,
      { headers: serviceHeaders(env) })
    if(!dueRes.ok) continue
    const due = (await dueRes.json()) as Array<{ id:string }>
    const max = Math.min(cap - results.length, due.length)
    if (max <= 0) break
    const select = due.slice(0,max)
    for (const item of select) {
      claimed += 1
      const res = await sendSequenceStep(env, { organizationId: org, enrollmentId: item.id, actorId: '00000000-0000-0000-0000-000000000000' })
      if (res.ok) { succeeded += 1 }
      else if (res.code === 'suppressed' || res.code === 'no_due_step' || res.code === 'not_active' || res.code === 'no_template') {
        retried += 1
      } else { failed += 1 }
      results.push({ id: item.id, ok: res.ok, error: res.ok ? undefined : `${res.error}${res.code ? ' ('+res.code+')' : ''}` })
    }
    if (results.length >= cap) break
  }
  return { claimed, succeeded, retried, failed, dispatched_at: now, results }
}

export async function handleSystemDispatch(env: Env, suppliedToken: string, bodyLimit?: number): Promise<{ status:number; body: unknown }> {
  const expected = env.DISPATCH_TOKEN
  if (!expected) return { status:503, body:{error:'DISPATCH_TOKEN not configured.'} }
  // constant-time compare
  const equal = await (async () => {
    const encoder = new TextEncoder()
    const [expectedHash, actualHash] = await Promise.all([
      crypto.subtle.digest('SHA-256', encoder.encode(expected)),
      crypto.subtle.digest('SHA-256', encoder.encode(suppliedToken)),
    ])
    const left = new Uint8Array(expectedHash); const right = new Uint8Array(actualHash)
    let diff = expected.length ^ suppliedToken.length
    for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i]
    return diff === 0
  })()
  if (!equal) return { status:401, body:{error:'Unauthorized'} }
  const out = await runSystemDispatch(env, bodyLimit ?? 10)
  return { status:200, body: out }
}
