import { createClient } from 'npm:@supabase/supabase-js@2'

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const apiKey = Deno.env.get('MCP_API_KEY') || Deno.env.get('GPT_ACTIONS_API_KEY')!
const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false } })

function jsonrpc(id: unknown, result: unknown, error?: { code: number; message: string }) {
  return Response.json({
    jsonrpc: '2.0',
    id: id ?? null,
    ...(error ? { error } : { result: result ?? null }),
  })
}

function authed(request: Request): boolean {
  const auth = request.headers.get('authorization') || request.headers.get('x-mcp-api-key')
  const token = auth?.replace(/^Bearer\s+/i, '')
  return !!apiKey && !!token && token === apiKey
}

const TOOLS = [
  {
    name: 'health_check',
    description: 'Check if the EIDEN Reach agent is healthy.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'get_outreach_kpis',
    description: 'Return enrollment counts by state for an organization.',
    inputSchema: { type: 'object', required: ['organizationId'], properties: { organizationId: { type: 'string' } } },
  },
  {
    name: 'upsert_contact',
    description: 'Create or update a contact row in the org.',
    inputSchema: { type: 'object', required: ['organizationId', 'email'], properties: { organizationId: { type: 'string' }, email: { type: 'string' }, first_name: { type: 'string' }, last_name: { type: 'string' }, company: { type: 'string' } } },
  },
  {
    name: 'get_team_list',
    description: 'Return workspace members for an organization (requires manager role).',
    inputSchema: { type: 'object', required: ['organizationId'], properties: { organizationId: { type: 'string' } } },
  },
  {
    name: 'dispatch_due_enrollments',
    description: 'Trigger the mailbox worker to dispatch due enrollments.',
    inputSchema: { type: 'object', required: ['organizationId'], properties: { organizationId: { type: 'string' }, limit: { type: 'number' } } },
  },
]

async function dispatchTool(name: string, args: any): Promise<unknown> {
  switch (name) {
    case 'health_check': return { ok: true, time: new Date().toISOString() }
    case 'get_outreach_kpis': {
      if (typeof args?.organizationId !== 'string' || !/^[0-9a-f-]{36}$/i.test(args.organizationId)) throw new Error('organizationId (uuid) is required')
      const { data, error } = await admin.from('sequence_enrollments').select('state,stop_reason,next_step_position').eq('organization_id', args.organizationId).limit(2000)
      if (error) throw new Error(error.message)
      return { organizationId: args.organizationId, count: data?.length ?? 0, enrollments: data ?? [] }
    }
    case 'upsert_contact': {
      if (!args || typeof args !== 'object' || typeof args.organizationId !== 'string' || typeof args.email !== 'string') throw new Error('organizationId and email are required')
      const { data, error } = await admin.from('contacts').upsert(args, { onConflict: 'id' }).select()
      if (error) throw new Error(error.message)
      return { ok: true, data: data ?? null }
    }
    case 'get_team_list': {
      if (typeof args?.organizationId !== 'string' || !/^[0-9a-f-]{36}$/i.test(args.organizationId)) throw new Error('organizationId (uuid) is required')
      const actorId = Deno.env.get('MCP_ACTOR_USER_ID')
      if (!actorId || !/^[0-9a-f-]{36}$/i.test(actorId)) throw new Error('MCP_ACTOR_USER_ID not configured')
      const m = await admin.from('memberships').select('role').eq('organization_id', args.organizationId).eq('user_id', actorId).maybeSingle()
      if (m.error || !m.data || !['super_admin','sales_manager'].includes(m.data.role)) throw new Error('Forbidden')
      const [members, audit] = await Promise.all([
        admin.from('memberships').select('user_id,role,created_at,profile:profiles(display_name,email)').eq('organization_id', args.organizationId).limit(500),
        admin.from('audit_logs').select('id,actor_id,action,resource_type,resource_id,result,created_at').eq('organization_id', args.organizationId).order('created_at', { ascending: false }).limit(50)
      ])
      if (members.error || audit.error) throw new Error(members.error?.message || audit.error?.message || 'query failed')
      return { members: members.data ?? [], audit: audit.data ?? [] }
    }
    case 'dispatch_due_enrollments': {
      if (!workerUrl || !dispatchToken) throw new Error('Mailbox worker is not configured for dispatch')
      const lim = Math.max(1, Math.min(5, typeof args?.limit === 'number' ? args.limit : 5))
      const response = await fetch(`${workerUrl}/system/dispatch-due`, { method: 'POST', headers: { 'x-dispatch-secret': dispatchToken } })
      const body = await response.json().catch(() => ({}))
      return { status: response.status, ...body }
    }
    default: throw new Error(`Unknown tool: ${name}`)
  }
}

const ALLOWED_ORIGINS = [
  Deno.env.get('APP_ORIGIN'),
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://chat.openai.com', // ChatGPT origin variations; adjust in production
].filter(Boolean) as string[]

function isAllowed(origin: string | null): boolean {
  return !!origin && ALLOWED_ORIGINS.includes(origin)
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin')
  if (origin && ALLOWED_ORIGINS.length && !isAllowed(origin)) {
    // still return MCP-shaped JSON (auth happens at handler)
  }
  if (request.method === 'OPTIONS') {
    const headers = new Headers({ 'Content-Type': 'application/json' })
    if (isAllowed(origin)) headers.set('Access-Control-Allow-Origin', origin)
    headers.set('Access-Control-Allow-Headers', 'authorization, content-type, x-mcp-api-key, mcp-session-id')
    headers.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
    return new Response(null, { status: 204, headers })
  }
  if (!authed(request) && request.method !== 'GET') return Response.json({ jsonrpc: '2.0', id: null, error: { code: -32000, message: 'Authentication required' } }, { status: 401, headers: { 'Content-Type': 'application/json' } })

  let body: any
  try { body = await request.json() } catch { body = {} }

  const id = body?.id ?? null
  const method = body?.method

  if (method === 'initialize' || method === 'notifications/initialized') {
    const headers = new Headers({ 'Content-Type': 'application/json' })
    if (isAllowed(origin)) headers.set('Access-Control-Allow-Origin', origin)
    return Response.json({
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: { tools: {} },
        serverInfo: { name: 'eiden-reach-mcp', version: '1.0.0' },
      },
    }, { status: 200, headers })
  }

  if (method === 'tools/list') {
    const headers = new Headers({ 'Content-Type': 'application/json' })
    if (isAllowed(origin)) headers.set('Access-Control-Allow-Origin', origin)
    return Response.json({ jsonrpc: '2.0', id, result: { tools: TOOLS } }, { status: 200, headers })
  }

  if (method === 'tools/call') {
    const name = body?.params?.name
    const args = body?.params?.arguments || {}
    if (!name) return jsonrpc(id, null, { code: -32600, message: 'Missing tool name' })
    try {
      const result = await dispatchTool(name, args)
      const headers = new Headers({ 'Content-Type': 'application/json' })
      if (isAllowed(origin)) headers.set('Access-Control-Allow-Origin', origin)
      return Response.json({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text' as const, text: JSON.stringify(result) }],
          isError: false,
        },
      }, { status: 200, headers })
    } catch (error) {
      const headers = new Headers({ 'Content-Type': 'application/json' })
      if (isAllowed(origin)) headers.set('Access-Control-Allow-Origin', origin)
      return Response.json({
        jsonrpc: '2.0',
        id,
        result: {
          content: [{ type: 'text' as const, text: String(error) }],
          isError: true,
        },
      }, { status: 200, headers })
    }
  }

  const headers = new Headers({ 'Content-Type': 'application/json' })
  if (isAllowed(origin)) headers.set('Access-Control-Allow-Origin', origin)
  return Response.json({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } }, { status: 404, headers })
})