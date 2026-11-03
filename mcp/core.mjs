const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const requestIdPattern = /^[A-Za-z0-9._:-]{1,120}$/
const emailPattern = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/

export function validateRuntimeScope(env) {
  const actorUserId = env.MCP_ACTOR_USER_ID
  const organizationId = env.MCP_ORGANIZATION_ID
  if (!actorUserId) throw new Error('MCP_ACTOR_USER_ID is required')
  if (!organizationId) throw new Error('MCP_ORGANIZATION_ID is required')
  if (!uuidPattern.test(actorUserId) || !uuidPattern.test(organizationId)) {
    throw new Error('MCP actor and organization must be valid UUID values')
  }
  return { actorUserId, organizationId }
}

export function assertManager(role) {
  if (role !== 'super_admin' && role !== 'sales_manager') {
    throw new Error('This tool requires a manager role')
  }
}

function requiredString(value, name, max) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${name} is required`)
  const normalized = value.trim()
  if (normalized.length > max) throw new Error(`${name} must be ${max} characters or fewer`)
  return normalized
}

function requestId(value) {
  const normalized = requiredString(value, 'requestId', 120)
  if (!requestIdPattern.test(normalized)) throw new Error('requestId contains unsupported characters')
  return normalized
}

export function validateContactRequest(input) {
  const firstName = requiredString(input?.firstName, 'firstName', 100)
  const lastName = typeof input?.lastName === 'string' ? input.lastName.trim() : ''
  if (lastName.length > 100) throw new Error('lastName must be 100 characters or fewer')
  const email = typeof input?.email === 'string' && input.email.trim()
    ? input.email.trim().toLowerCase()
    : null
  if (email && (email.length > 320 || !emailPattern.test(email))) throw new Error('email is invalid')
  return { requestId: requestId(input?.requestId), firstName, lastName, email }
}


export function validateTaskRequest(input) {
  const title = requiredString(input?.title, 'title', 200)
  const dueAt = typeof input?.dueAt === 'string' && input.dueAt.trim() ? input.dueAt.trim() : null
  if (dueAt && Number.isNaN(new Date(dueAt).getTime())) throw new Error('dueAt must be a valid ISO 8601 datetime')
  return { requestId: requestId(input?.requestId), title, dueAt }
}

export function validateCompanyRequest(input) {
  const name = requiredString(input?.name, 'name', 200)
  const domain = typeof input?.domain === 'string' && input.domain.trim()
    ? input.domain.trim().toLowerCase()
    : null
  if (domain && (domain.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(domain))) {
    throw new Error('domain is invalid')
  }
  return { requestId: requestId(input?.requestId), name, domain }
}

export function approvalIdempotencyKey(actionType, actorUserId, stableRequestId) {
  return `mcp:${actionType}:${actorUserId}:${stableRequestId}`
}
