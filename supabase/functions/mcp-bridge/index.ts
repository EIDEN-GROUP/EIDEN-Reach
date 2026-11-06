import { createClient } from 'npm:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const apiKey = Deno.env.get('MCP_API_KEY') || Deno.env.get('GPT_ACTIONS_API_KEY')!
const appOrigin = Deno.env.get('APP_ORIGIN') || null
const workerUrl = Deno.env.get('MAILBOX_WORKER_URL')?.replace(/\/$/, '')
const dispatchToken = Deno.env.get('DISPATCH_TOKEN')
const actorId = Deno.env.get('MCP_ACTOR_USER_ID') || ''
const signingSecret = dispatchToken || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || apiKey

const jsonHeaders = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

function respond(body: unknown, status: number, headers?: Record<string,string>) {
  const h = new Headers(jsonHeaders)
  const origin = requestOrigin()
  if (origin && (ALLOWED_ORIGINS.includes(origin) || ALLOWED_ORIGINS.length === 0)) h.set('Access-Control-Allow-Origin', origin)
  if (headers) Object.entries(headers).forEach(([k,v]) => h.set(k,v))
  return new Response(JSON.stringify(body), { status, headers: h })
}

let _req: Request | null = null
function requestOrigin() { return _req?.headers.get('origin') ?? null }

const ALLOWED_ORIGINS = [appOrigin, 'http://localhost:5173', 'http://127.0.0.1:5173', 'https://chatgpt.com', 'https://chat.openai.com'].filter(Boolean) as string[]

// Base64 URL helpers
function b64Url(buf: ArrayBuffer): string { return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'') }
function b64UrlJson(payload: Record<string,unknown>): string { return btoa(JSON.stringify(payload)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'') }

async function sign(data: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(signingSecret), { name:'HMAC', hash:'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data))
  return b64Url(sig)
}

async function makeSignedCode(payload: Record<string, unknown>): Promise<string> {
  const encoded = b64UrlJson(payload)
  const sig = await sign(encoded)
  return `${encoded}.${sig}`
}

async function verifySignedCode(code: string): Promise<Record<string,unknown> | null> {
  const parts = code.split('.')
  if (parts.length !== 2) return null
  const [encoded, sig] = parts
  const expected = await sign(encoded)
  if (expected !== sig) return null
  try {
    const json = JSON.parse(atob(encoded.replace(/-/g,'+').replace(/_/g,'/')))
    if (typeof json.exp === 'number' && (json.exp * 1000) < Date.now()) return null
    return json
  } catch { return null }
}

function authed(request: Request): boolean {
  const auth = request.headers.get('authorization') || request.headers.get('x-mcp-api-key')
  const token = auth?.replace(/^Bearer\s+/i, '')
  return !!apiKey && !!token && token === apiKey
}

const TOOLS = [
  { name: 'health_check', description: 'Check if the EIDEN Reach agent is healthy.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_outreach_kpis', description: 'Return enrollment counts by state.', inputSchema: { type: 'object', required: ['organizationId'], properties: { organizationId: { type: 'string' } } } },
  { name: 'upsert_contact', description: 'Create or update a contact row in the org.', inputSchema: { type: 'object', required: ['organizationId'], properties: { organizationId: { type: 'string' }, email: { type: 'string' }, first_name: { type: 'string' }, last_name: { type: 'string' } } } },
  { name: 'get_team_list', description: 'List workspace members (requires manager role).', inputSchema: { type: 'object', required: ['organizationId'], properties: { organizationId: { type: 'string' } } } },
  { name: 'dispatch_due_enrollments', description: 'Dispatch due enrollments via the worker.', inputSchema: { type: 'object', required: ['organizationId'], properties: { organizationId: { type: 'string' }, limit: { type: 'number' } } } },
]

async function dispatchTool(name: string, args: any): Promise<unknown> {
  switch (name) {
    case 'health_check': return { ok: true, time: new Date().toISOString(), actor: actorId || null }
    case 'get_outreach_kpis': {
      if (typeof args?.organizationId !== 'string' || !/^[0-9a-f-]{36}$/i.test(args.organizationId)) throw new Error('organizationId (uuid) required')
      const { data, error } = await admin.from('sequence_enrollments').select('state,stop_reason,next_step_position').eq('organization_id', args.organizationId).limit(2000)
      if (error) throw new Error(error.message)
      return { organizationId: args.organizationId, count: data?.length ?? 0, enrollments: data ?? [] }
    }
    case 'upsert_contact': {
      if (!args || typeof args !== 'object' || typeof args.organizationId !== 'string') throw new Error('organizationId required')
      if (typeof args.email !== 'string' && typeof args.id !== 'string') throw new Error('email or id required')
      const { data, error } = await admin.from('contacts').upsert(args, { onConflict: 'id' }).select()
      if (error) throw new Error(error.message)
      return { ok: true, data: data ?? null }
    }
    case 'get_team_list': {
      if (typeof args?.organizationId !== 'string' || !/^[0-9a-f-]{36}$/i.test(args.organizationId) || !actorId) throw new Error('organizationId and MCP_ACTOR_USER_ID required')
      const m = await admin.from('memberships').select('role').eq('organization_id', args.organizationId).eq('user_id', actorId).maybeSingle()
      if (m.error || !m.data || !['super_admin','sales_manager'].includes(m.data.role)) throw new Error('Forbidden')
      const [members, audit] = await Promise.all([
        admin.from('memberships').select('user_id,role,created_at,profile:profiles(display_name,email)').eq('organization_id', args.organizationId),
        admin.from('audit_logs').select('id,actor_id,action,resource_type,resource_id,result,created_at').eq('organization_id', args.organizationId).order('created_at', { ascending: false }).limit(50)
      ])
      if (members.error || audit.error) throw new Error(members.error?.message || audit.error?.message || 'query failed')
      return { members: members.data ?? [], audit: audit.data ?? [] }
    }
    case 'dispatch_due_enrollments': {
      if (typeof args?.organizationId !== 'string') throw new Error('organizationId required')
      if (!workerUrl || !dispatchToken) throw new Error('Worker dispatch not configured')
      const limit = Math.max(1, Math.min(5, typeof args.limit === 'number' ? args.limit : 5))
      const response = await fetch(`${workerUrl}/system/dispatch-due`, { method: 'POST', headers: { 'x-dispatch-secret': dispatchToken } })
      return await response.json().catch(() => ({}))
    }
    default: throw new Error(`Unknown tool: ${name}`)
  }
}

function uuid(v: unknown): v is string { return typeof v === 'string' && /^[0-9a-f-]{36}$/i.test(v) }

function metadataResponse() {
  const base = (Deno.env.get('MCP_BASE_URL') || 'https://cztvpgwjfmbcxbzfdcdx.supabase.co/functions/v1/mcp-bridge').replace(/\/$/, '')
  return {
    issuer: base,
    authorization_endpoint: `${base}/authorize`,
    token_endpoint: `${base}/token`,
    registration_endpoint: `${base}/register`,
    jwks_uri: `${base}/.well-known/jwks.json`,
    grant_types_supported: ['authorization_code'],
    response_types_supported: ['code'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none','client_secret_post'],
    scopes_supported: ['mcp.read', 'mcp.write'],
  }
}

Deno.serve(async (request) => {
  _req = request
  const origin = request.headers.get('origin')

  if (request.method === 'OPTIONS') {
    const headers = new Headers({ 'Content-Type': 'application/json' })
    if (origin && ALLOWED_ORIGINS.includes(origin)) headers.set('Access-Control-Allow-Origin', origin)
    headers.set('Access-Control-Allow-Headers', 'authorization, content-type, x-mcp-api-key, mcp-session-id')
    headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    return new Response(null, { status: 204, headers })
  }

  const url = new URL(request.url)
  const path = url.pathname.replace('/mcp-bridge', '').replace('/functions/v1/mcp-bridge', '')

  // Discovery (no auth)
  if ((path === '/.well-known/oauth-authorization-server' || path === '/.well-known/openid-configuration') && (request.method === 'GET')) {
    return respond(metadataResponse(), 200, { 'Content-Type': 'application/json' })
  }

  // Authorization redirect (no auth)
  if (path === '/authorize' && request.method === 'GET') {
    const redirectUri = url.searchParams.get('redirect_uri')
    const codeChallenge = url.searchParams.get('code_challenge') || ''
    const codeChallengeMethod = (url.searchParams.get('code_challenge_method') || 'S256').toUpperCase()
    const state = url.searchParams.get('state') || ''
    if (!redirectUri) return respond({ error: 'redirect_uri required' }, 400)
    if (!ALLOWED_ORIGINS.includes(redirectUri) && !ALLOWED_ORIGINS.includes(origin || '')) {
      // still allow production APP_ORIGIN prefix
    }
    const payload = {
      redirect_uri: redirectUri,
      code_challenge: codeChallenge,
      code_challenge_method: codeChallengeMethod,
      client_id: url.searchParams.get('client_id') || 'unknown',
      exp: Math.floor(Date.now() / 1000) + 600,
    }
    const code = await makeSignedCode(payload)
    const location = `${redirectUri}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(state)}`
    return new Response(null, { status: 302, headers: { Location: location } })
  }

  // Client registration endpoint (post; returns a constant client just for simple connectors)
  if (path === '/register' && request.method === 'POST') {
    return respond({ client_id: 'eiden-mcp-client', client_secret: apiKey, token_endpoint_auth_method: 'none', grant_types: ['authorization_code'], response_types: ['code'], redirect_uris: ALLOWED_ORIGINS }, 200)
  }

  // Token endpoint (no auth beyond registered no-auth; code + PKCE required)
  if (path === '/token' && request.method === 'POST') {
    let params: Record<string,string> = {}
    const contentType = request.headers.get('content-type') || ''
    if (contentType.includes('application/json')) params = await request.json().catch(() => ({}))
    else if (contentType.includes('application/x-www-form-urlencoded')) params = Object.fromEntries(new URLSearchParams(await request.text()))
    else params = Object.fromEntries(new URLSearchParams(await request.text().catch(() => '')))

    const grantType = params.grant_type || 'authorization_code'
    if (grantType === 'authorization_code') {
      const code = params.code
      const redirectUri = params.redirect_uri || ''
      const codeVerifier = params.code_verifier || ''
      const payload = await verifySignedCode(code || '')
      if (!payload) return respond({ error: 'invalid_grant' }, 400)
      if (typeof payload.redirect_uri === 'string' && payload.redirect_uri !== redirectUri && redirectUri) return respond({ error: 'invalid_redirect_uri' }, 400)
      if (typeof payload.code_challenge === 'string' && payload.code_challenge.length > 0) {
        const enc = new TextEncoder().encode(codeVerifier)
        const digest = await crypto.subtle.digest('SHA-256', enc)
        const candidate = btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')
        if (candidate !== payload.code_challenge) return respond({ error: 'pkce_mismatch' }, 400)
      }
      return respond({
        access_token: apiKey, token_type: 'Bearer',
        expires_in: 3600, refresh_token: apiKey + '.refresh',
        scope: (params.scope || 'mcp.read mcp.write'),
      }, 200)
    }
    if (grantType === 'client_credentials') {
      return respond({ access_token: apiKey, token_type: 'Bearer', expires_in: 3600 }, 200)
    }
    return respond({ error: 'unsupported_grant_type' }, 400)
  }

  // If no bearer or API key present, reject
  if (!authed(request)) return respond({ error: 'Authentication required' }, 401)

  let body: any = {}
  try { body = await request.json() } catch { body = {} }
  const id = body?.id ?? null
  const method = body?.method

  if (method === 'initialize' || method === 'notifications/initialized') {
    return respond({ jsonrpc: '2.0', id, result: { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'eiden-reach-mcp', version: '1.0.0' } } }, 200)
  }
  if (method === 'tools/list') return respond({ jsonrpc: '2.0', id, result: { tools: TOOLS } }, 200)

  if (method === 'tools/call') {
    const name = body?.params?.name
    const args = body?.params?.arguments || {}
    if (!name) return respond({ jsonrpc:'2.0', id, error:{code:-32600,message:'Missing tool name'} }, 400)
    try {
      const result = await dispatchTool(name, args)
      return respond({ jsonrpc:'2.0', id, result: { content: [{ type:'text', text: JSON.stringify(result) }], isError:false } }, 200)
    } catch (error) {
      return respond({ jsonrpc:'2.0', id, result: { content: [{ type:'text', text: String(error) }], isError:true } }, 200)
    }
  }
  return respond({ jsonrpc:'2.0', id, error:{code:-32601, message:`Method not found: ${method}`} }, 404)
})