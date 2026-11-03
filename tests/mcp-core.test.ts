import { describe, expect, it } from 'vitest'
import {
  approvalIdempotencyKey,
  assertManager,
  validateCompanyRequest,
  validateContactRequest,
  validateRuntimeScope,
  validateTaskRequest,
} from '../mcp/core.mjs'

describe('MCP runtime scope', () => {
  it('requires a fixed actor and organization instead of caller-supplied tenant scope', () => {
    expect(() => validateRuntimeScope({})).toThrow('MCP_ACTOR_USER_ID')
    expect(() => validateRuntimeScope({ MCP_ACTOR_USER_ID: 'bad', MCP_ORGANIZATION_ID: 'bad' })).toThrow('valid UUID')
    expect(validateRuntimeScope({
      MCP_ACTOR_USER_ID: '11111111-1111-4111-8111-111111111111',
      MCP_ORGANIZATION_ID: '22222222-2222-4222-8222-222222222222',
    })).toEqual({
      actorUserId: '11111111-1111-4111-8111-111111111111',
      organizationId: '22222222-2222-4222-8222-222222222222',
    })
  })

  it('restricts approval review reads to managers', () => {
    expect(() => assertManager('sales_representative')).toThrow('manager role')
    expect(() => assertManager('analyst')).toThrow('manager role')
    expect(() => assertManager('sales_manager')).not.toThrow()
    expect(() => assertManager('super_admin')).not.toThrow()
  })
})

describe('MCP approval requests', () => {
  it('validates contact inputs and requires a stable request id', () => {
    expect(validateContactRequest({ requestId: 'req-42', firstName: ' Ada ', lastName: ' Lovelace ', email: 'ADA@example.com' })).toEqual({
      requestId: 'req-42', firstName: 'Ada', lastName: 'Lovelace', email: 'ada@example.com',
    })
    expect(() => validateContactRequest({ firstName: 'Ada' })).toThrow('requestId')
    expect(() => validateContactRequest({ requestId: 'x', firstName: '', email: 'bad' })).toThrow()
  })

  it('validates company inputs and domain boundaries', () => {
    expect(validateCompanyRequest({ requestId: 'req-7', name: ' EIDEN ', domain: 'EXAMPLE.COM ' })).toEqual({
      requestId: 'req-7',
      name: 'EIDEN',
      domain: 'example.com',
    })
    expect(() => validateCompanyRequest({ requestId: 'req-7', name: '', domain: 'example.com' })).toThrow('name is required')
    expect(() => validateCompanyRequest({ requestId: 'req-7', name: 'EIDEN', domain: 'bad domain' })).toThrow('domain is invalid')
    expect(() => validateCompanyRequest({ name: 'EIDEN' })).toThrow('requestId')
  })

  it('creates deterministic per-actor idempotency keys', () => {
    expect(approvalIdempotencyKey('contact.create', '11111111-1111-4111-8111-111111111111', 'req-42'))
      .toBe('mcp:contact.create:11111111-1111-4111-8111-111111111111:req-42')
  })

  it('validates task requests before approval creation', () => {
    expect(validateTaskRequest({ requestId: 'req-9', title: 'Follow up with Ada', dueAt: '2026-11-05T10:00:00Z' })).toEqual({ requestId: 'req-9', title: 'Follow up with Ada', dueAt: '2026-11-05T10:00:00Z' })
    expect(() => validateTaskRequest({ requestId: 'req-9', title: '' })).toThrow('title is required')
    expect(() => validateTaskRequest({ requestId: 'req-9', title: 'Follow up', dueAt: 'not a date' })).toThrow('dueAt')
    expect(() => validateTaskRequest({ title: 'Follow up' })).toThrow('requestId')
  })
})
