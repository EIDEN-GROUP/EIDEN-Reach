import { dispatchBatch, type DurableJob, type JobStore } from './engine'

interface Env {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
  DISPATCH_TOKEN: string
}

type ScheduledController = { cron: string; scheduledTime: number; noRetry(): void }
type ExecutionContext = { waitUntil(promise: Promise<unknown>): void }

async function constantTimeEqual(expected: string, actual: string): Promise<boolean> {
  const encoder = new TextEncoder()
  const [expectedHash, actualHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
    crypto.subtle.digest('SHA-256', encoder.encode(actual)),
  ])
  const left = new Uint8Array(expectedHash)
  const right = new Uint8Array(actualHash)
  let difference = expected.length ^ actual.length
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index]
  return difference === 0
}

function createStore(env: Env): JobStore {
  const base = `${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/`
  async function rpc<T>(procedure: string, body: Record<string, unknown>): Promise<T> {
    const response = await fetch(`${base}${procedure}`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
    })
    if (!response.ok) throw new Error(`database_rpc_${response.status}`)
    return await response.json() as T
  }
  return {
    claim: (limit, leaseSeconds) => rpc<DurableJob[]>('claim_due_jobs', { batch_size: limit, lease_seconds: leaseSeconds }),
    finish: (job, resultCode) => rpc<boolean>('finish_scheduled_job', { target_job: job.id, target_claim: job.claim_token, result: resultCode }),
    retry: async (job, errorCode, retryAt) => { await rpc<boolean>('retry_scheduled_job', { target_job: job.id, target_claim: job.claim_token, failure_code: errorCode, retry_at: retryAt }) },
  }
}

async function dispatch(env: Env): Promise<Response> {
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return new Response('Worker is not configured', { status: 503 })
  try {
    const result = await dispatchBatch(createStore(env), {})
    return Response.json(result)
  } catch {
    return new Response('Job dispatch failed', { status: 503 })
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)
    if (request.method === 'GET' && url.pathname === '/health') return Response.json({ status: 'ok' })
    if (request.method === 'POST' && url.pathname === '/dispatch') {
      const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
      if (!env.DISPATCH_TOKEN || !await constantTimeEqual(env.DISPATCH_TOKEN, supplied)) return new Response('Unauthorized', { status: 401 })
      return dispatch(env)
    }
    return new Response('Not found', { status: 404 })
  },
  scheduled(_controller: ScheduledController, env: Env, context: ExecutionContext): void {
    context.waitUntil(dispatch(env))
  },
}
