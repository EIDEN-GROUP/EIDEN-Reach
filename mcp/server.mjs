import { createInterface } from 'node:readline'
import {
  approvalIdempotencyKey,
  assertManager,
  validateCompanyRequest,
  validateContactRequest,
  validateRuntimeScope,
  validateTaskRequest,
} from './core.mjs'

const SUPABASE_URL = process.env.SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

function databaseConfig() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required')
  }
  return { baseUrl: SUPABASE_URL.replace(/\/$/, ''), serviceKey: SERVICE_ROLE_KEY }
}

function rpcResult(id, result) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, result })}\n`)
}

function rpcError(id, code, message) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } })}\n`)
}

function serviceHeaders(contentType = false) {
  const { serviceKey } = databaseConfig()
  return {
    apikey: serviceKey,
    authorization: `Bearer ${serviceKey}`,
    ...(contentType ? { 'content-type': 'application/json' } : {}),
  }
}

async function selectRows(table, columns, filters = {}, options = {}) {
  const { baseUrl } = databaseConfig()
  const url = new URL(`${baseUrl}/rest/v1/${table}`)
  url.searchParams.set('select', columns)
  url.searchParams.set('limit', String(options.limit ?? 100))
  for (const [name, value] of Object.entries(filters)) {
    if (value !== undefined && value !== null) url.searchParams.set(name, String(value))
  }
  if (options.order) url.searchParams.set('order', options.order)
  const response = await fetch(url, { headers: serviceHeaders() })
  if (!response.ok) throw new Error(`Database read failed (${response.status})`)
  return await response.json()
}

async function insertRow(table, body) {
  const { baseUrl } = databaseConfig()
  const response = await fetch(`${baseUrl}/rest/v1/${table}`, {
    method: 'POST',
    headers: { ...serviceHeaders(true), Prefer: 'return=representation' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const error = new Error(`Database write failed (${response.status})`)
    error.status = response.status
    throw error
  }
  const data = await response.json()
  return Array.isArray(data) ? data[0] : data
}

async function requireMembership(organizationId, actorUserId) {
  const rows = await selectRows('memberships', 'role', {
    organization_id: `eq.${organizationId}`,
    user_id: `eq.${actorUserId}`,
  }, { limit: 1 })
  if (!Array.isArray(rows) || !rows[0]?.role) throw new Error('MCP actor is not a member of the configured organization')
  return rows[0].role
}

async function writeAudit(organizationId, actorId, tool, result, details = {}) {
  await insertRow('audit_logs', {
    organization_id: organizationId,
    actor_id: actorId,
    action: 'mcp.tool_call',
    resource_type: 'mcp_tool',
    resource_id: tool,
    result,
    details,
  })
}

async function createApproval(scope, actionType, resourceType, requestId, preview) {
  const idempotencyKey = approvalIdempotencyKey(actionType, scope.actorUserId, requestId)
  try {
    return await insertRow('approval_records', {
      organization_id: scope.organizationId,
      requested_by: scope.actorUserId,
      action_type: actionType,
      resource_type: resourceType,
      state: 'pending',
      preview,
      idempotency_key: idempotencyKey,
      expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    })
  } catch (error) {
    if (error.status !== 409) throw error
    const existing = await selectRows('approval_records', 'id,state,preview,expires_at', {
      organization_id: `eq.${scope.organizationId}`,
      idempotency_key: `eq.${idempotencyKey}`,
    }, { limit: 1 })
    if (!Array.isArray(existing) || !existing[0]) throw error
    return existing[0]
  }
}

const TOOLS = [
  { name: 'list_contacts', description: 'List contacts in the configured organization.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'list_companies', description: 'List companies in the configured organization.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'list_deals', description: 'List deals in the configured organization.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'list_tasks', description: 'List tasks in the configured organization.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'list_pipeline_stages', description: 'List stages from the default pipeline.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'list_pending_approvals', description: 'List pending write approvals. Manager role required.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'list_sequences', description: 'List sequences in the configured organization.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'list_enrollments', description: 'List sequence enrollments. Manager role required.', inputSchema: { type: 'object', properties: {}, additionalProperties: false } },
  {
    name: 'request_create_contact',
    description: 'Request approval to create a contact. Does not create the contact.',
    inputSchema: {
      type: 'object',
      properties: {
        requestId: { type: 'string', description: 'Stable caller-generated idempotency ID.' },
        firstName: { type: 'string' },
        lastName: { type: 'string' },
        email: { type: 'string' },
      },
      required: ['requestId', 'firstName'],
      additionalProperties: false,
    },
  },
  {
    name: 'request_create_company',
    description: 'Request approval to create a company. Does not create the company.',
    inputSchema: {
      type: 'object',
      properties: {
        requestId: { type: 'string', description: 'Stable caller-generated idempotency ID.' },
        name: { type: 'string' },
        domain: { type: 'string' },
      },
      required: ['requestId', 'name'],
      additionalProperties: false,
    },
  },
  {
    name: 'request_create_task',
    description: 'Request approval to create a follow-up task. Does not create the task.',
    inputSchema: {
      type: 'object',
      properties: {
        requestId: { type: 'string', description: 'Stable caller-generated idempotency ID.' },
        title: { type: 'string' },
        dueAt: { type: 'string', description: 'ISO 8601 datetime' },
      },
      required: ['requestId', 'title'],
      additionalProperties: false,
    },
  },
]

async function callTool(name, args) {
  const scope = validateRuntimeScope(process.env)
  const role = await requireMembership(scope.organizationId, scope.actorUserId)
  let data

  if (name === 'list_contacts') {
    data = await selectRows('contacts', 'id,first_name,last_name,email,job_title,lifecycle,company_id', { organization_id: `eq.${scope.organizationId}`, archived_at: 'is.null' }, { order: 'created_at.desc' })
  } else if (name === 'list_companies') {
    data = await selectRows('companies', 'id,name,domain,industry,location,employee_count', { organization_id: `eq.${scope.organizationId}`, archived_at: 'is.null' }, { order: 'name.asc' })
  } else if (name === 'list_deals') {
    data = await selectRows('deals', 'id,name,amount,currency,stage_id,status,expected_close_on', { organization_id: `eq.${scope.organizationId}`, archived_at: 'is.null' }, { order: 'created_at.desc' })
  } else if (name === 'list_tasks') {
    data = await selectRows('tasks', 'id,title,due_at,status,priority,owner_id,contact_id,company_id,deal_id', { organization_id: `eq.${scope.organizationId}` }, { order: 'due_at.asc.nullslast' })
  } else if (name === 'list_pending_approvals') {
    assertManager(role)
    data = await selectRows('approval_records', 'id,requested_by,action_type,resource_type,state,preview,created_at,expires_at', { organization_id: `eq.${scope.organizationId}`, state: 'eq.pending' }, { order: 'created_at.desc' })
  } else if (name === 'list_pipeline_stages') {
    const pipelines = await selectRows('pipelines', 'id', { organization_id: `eq.${scope.organizationId}`, is_default: 'eq.true' }, { limit: 1 })
    const pipelineId = Array.isArray(pipelines) ? pipelines[0]?.id : null
    if (!pipelineId) throw new Error('No default pipeline exists for the configured organization')
    data = await selectRows('pipeline_stages', 'id,name,position,probability,is_won,is_lost', { pipeline_id: `eq.${pipelineId}` }, { order: 'position.asc' })
  } else if (name === 'list_sequences') {
    data = await selectRows('sequences', 'id,name,description,status,category,current_version,daily_limit,sender_mailbox_id', { organization_id: `eq.${scope.organizationId}`, archived_at: 'is.null' }, { order: 'name.asc' })
  } else if (name === 'list_enrollments') {
    assertManager(role)
    data = await selectRows('sequence_enrollments', 'id,sequence_id,sequence_version,contact_id,state,next_step_position,next_run_at,stopped_at,stop_reason', { organization_id: `eq.${scope.organizationId}` }, { order: 'next_run_at.asc.nullsfirst' })
  } else if (name === 'request_create_contact') {
    const input = validateContactRequest(args)
    const row = await createApproval(scope, 'contact.create', 'contact', input.requestId, {
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
    })
    data = { approvalId: row.id, state: row.state, preview: row.preview, expiresAt: row.expires_at }
  } else if (name === 'request_create_company') {
    const input = validateCompanyRequest(args)
    const row = await createApproval(scope, 'company.create', 'company', input.requestId, {
      name: input.name,
      domain: input.domain,
    })
    data = { approvalId: row.id, state: row.state, preview: row.preview, expiresAt: row.expires_at }
  } else if (name === 'request_create_task') {
    const input = validateTaskRequest(args)
    const row = await createApproval(scope, 'task.create', 'task', input.requestId, {
      title: input.title,
      dueAt: input.dueAt,
    })
    data = { approvalId: row.id, state: row.state, preview: row.preview, expiresAt: row.expires_at }
  } else {
    throw new Error(`Unknown tool: ${name}`)
  }

  await writeAudit(scope.organizationId, scope.actorUserId, name, 'success')
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] }
}

const input = createInterface({ input: process.stdin })
input.on('line', async line => {
  let message
  try {
    message = JSON.parse(line)
  } catch {
    rpcError(null, -32700, 'Parse error')
    return
  }
  const { id, method, params } = message
  if (method === 'initialize') {
    rpcResult(id, { protocolVersion: '2024-11-05', capabilities: { tools: {} }, serverInfo: { name: 'eiden-reach-mcp', version: '0.4.0' } })
    return
  }
  if (method === 'tools/list') {
    rpcResult(id, { tools: TOOLS })
    return
  }
  if (method === 'tools/call') {
    try {
      rpcResult(id, await callTool(params?.name, params?.arguments ?? {}))
    } catch (error) {
      rpcError(id, -32000, error instanceof Error ? error.message : 'Tool call failed')
    }
    return
  }
  if (method === 'notifications/initialized') return
  rpcError(id, -32601, `Method not found: ${method}`)
})

process.on('SIGINT', () => process.exit(0))
