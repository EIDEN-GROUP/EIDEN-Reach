import { createClient } from 'npm:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const apiKey = Deno.env.get('GPT_ACTIONS_API_KEY')!
const appOrigin = Deno.env.get('APP_ORIGIN') || null
const workerUrl = Deno.env.get('MAILBOX_WORKER_URL')?.replace(/\/$/, '')
const dispatchToken = Deno.env.get('DISPATCH_TOKEN')

const jsonHeaders = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
function respond(body: unknown, status: number) {
  const headers = new Headers(jsonHeaders)
  if (appOrigin) headers.set('Access-Control-Allow-Origin', appOrigin)
  else headers.set('Access-Control-Allow-Origin', '*')
  return new Response(JSON.stringify(body), { status, headers })
}

function authed(request: Request): boolean {
  const token = request.headers.get('x-gpt-actions-key') || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
  return !!token && token === apiKey
}

const OPENAPI_SCHEMA = {
  openapi: '3.1.0',
  info: { title: 'EIDEN Reach GPT Actions', version: '1.0.0' },
  servers: [{ url: '/functions/v1/gpt-actions' }],
  paths: {
    '/health': { get: { operationId: 'healthCheck', responses: { '200': { description: 'Service health' } } } },
    '/kpis': { get: { operationId: 'getOutreachKpis', parameters: [{ in: 'query', name: 'organizationId', required: true, schema: { type: 'string' } }], responses: { '200': { description: 'Outreach KPIs' } } } },
    '/contacts/upsert': { post: { operationId: 'upsertContact', responses: { '200': { description: 'Contact result' } } } },
    '/teams/list': { post: { operationId: 'listTeam', responses: { '200': { description: 'Team list' } } } },
    '/dispatch-due': { post: { operationId: 'dispatchDueEnrollments', responses: { '200': { description: 'Dispatch results' } } } },
    '/openapi.json': { get: { operationId: 'openapi', responses: { '200': { description: 'OpenAPI spec' } } } }
  },
  components: { securitySchemes: { ApiKeyAuth: { type: 'apiKey', in: 'header', name: 'x-gpt-actions-key' } } },
  security: [{ ApiKeyAuth: [] }],
}

function uuid(v: unknown): v is string { return typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) }
function stripSecrets(obj: unknown): unknown { return obj } // extend as needed

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return respond({ ok: true }, 204)
  if (request.method !== 'GET' && request.method !== 'POST') return respond({ error: 'Method not allowed' }, 405)
  if (!apiKey) return respond({ error: 'GPT_ACTIONS_API_KEY not configured' }, 503)
  if (!authed(request)) return respond({ error: 'Invalid or missing x-gpt-actions-key' }, 401)

  const url = new URL(request.url)
  const path = url.pathname.replace('/gpt-actions', '').replace('/functions/v1/gpt-actions', '')
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

  if (path === '/health') return respond({ ok: true, time: new Date().toISOString() }, 200)
  if (path === '/openapi.json') return respond(OPENAPI_SCHEMA, 200)

  if (path === '/kpis' && request.method === 'GET') {
    const org = url.searchParams.get('organizationId')
    if (!uuid(org)) return respond({ error: 'organizationId (uuid) required' }, 400)
    const { data, error } = await admin.from('sequence_enrollments').select('state,stop_reason,next_step_position').eq('organization_id', org).limit(2000)
    if (error) return respond({ error: error.message }, 500)
    return respond({ organizationId: org, enrollments: data ?? [] }, 200)
  }

  if (path === '/contacts/upsert' && request.method === 'POST') {
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') return respond({ error: 'JSON object required' }, 400)
    const org = (body as any).organizationId || (body as any).organization_id
    if (!uuid(org)) return respond({ error: 'organizationId (uuid) required' }, 400)
    const { data, error } = await admin.from('contacts').upsert(body, { onConflict: 'id' }).select()
    if (error) return respond({ error: error.message }, 500)
    return respond({ ok: true, data }, 200)
  }

  if (path === '/teams/list' && request.method === 'POST') {
    const body = await request.json().catch(() => null) as any
    const org = body?.organizationId
    if (!uuid(org)) return respond({ error: 'organizationId (uuid) required' }, 400)
    const actorId = Deno.env.get('MCP_ACTOR_USER_ID')
    if (!actorId || !uuid(actorId)) return respond({ error: 'MCP_ACTOR_USER_ID not configured' }, 500)
    const membership = await admin.from('memberships').select('role').eq('organization_id', org).eq('user_id', actorId).maybeSingle()
    if (membership.error || !membership.data || !['super_admin','sales_manager'].includes(membership.data.role)) return respond({ error: 'Forbidden' }, 403)
    const [members, audit] = await Promise.all([
      admin.from('memberships').select('user_id,role,created_at,profile:profiles(display_name,email)').eq('organization_id', org).limit(500),
      admin.from('audit_logs').select('id,actor_id,action,resource_type,resource_id,result,created_at').eq('organization_id', org).order('created_at', { ascending: false }).limit(50)
    ])
    if (members.error || audit.error) return respond({ error: members.error?.message || audit.error?.message || 'query failed' }, 500)
    return respond(stripSecrets({ members: members.data ?? [], audit: audit.data ?? [] }), 200)
  }

  if (path === '/dispatch-due' && request.method === 'POST') {
    const body = await request.json().catch(() => null) as any
    const org = body?.organizationId
    const limit = Math.max(1, Math.min(5, typeof body?.limit === 'number' ? body.limit : 5))
    if (!uuid(org)) return respond({ error: 'organizationId (uuid) required' }, 400)
    if (!workerUrl || !dispatchToken) return respond({ error: 'Mailbox worker dispatch is not configured' }, 503)
    const workerRes = await fetch(`${workerUrl}/system/dispatch-due`, { method: 'POST', headers: { 'x-dispatch-secret': dispatchToken } })
    const result = await workerRes.json().catch(() => ({}))
    return new Response(JSON.stringify(stripSecrets(result)), { status: workerRes.status, headers: new Headers(jsonHeaders) })
  }

  return respond({ error: 'Not found', path }, 404)
})