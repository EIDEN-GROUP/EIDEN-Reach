import { describe, expect, it } from 'vitest'
import { companyInput, contactInput, dealInput, enrollmentState, noteInput, taskInput } from '../src/lib/validation.ts'
import { requireCapability, UnsupportedProviderCapabilityError, type EmailProviderAdapter } from '../src/lib/email-provider.ts'
import { canAssignMemberRole, parseTeamInvite } from '../src/lib/team-validation.ts'
import { parseMailboxInput } from '../workers/mailbox/src/input.ts'

describe('input validation', () => {
  it('trims contact names and turns a blank email into null', () => {
    expect(contactInput.parse({ firstName: ' Ada ', lastName: ' Lovelace ', email: '' })).toEqual({ firstName: 'Ada', lastName: 'Lovelace', email: null })
  })

  it('rejects malformed contact email addresses', () => {
    expect(contactInput.safeParse({ firstName: 'Ada', lastName: '', email: 'not-an-email' }).success).toBe(false)
  })

  it('accepts an absent company domain and rejects oversized domains', () => {
    expect(companyInput.parse({ name: ' Analytic Engines ', domain: '' }).domain).toBeNull()
    expect(companyInput.safeParse({ name: 'Example', domain: 'x'.repeat(254) }).success).toBe(false)
    expect(companyInput.parse({ name: 'Example', domain: '', employeeCount: '42' }).employeeCount).toBe(42)
    expect(companyInput.safeParse({ name: 'Example', domain: '', employeeCount: '-2' }).success).toBe(false)
  })

  it('validates nonnegative deal amounts and ISO currency codes', () => {
    expect(dealInput.parse({ name: 'Pilot', amount: '1250.50', currency: 'USD' }).amount).toBe(1250.5)
    expect(dealInput.parse({ name: 'Pilot', amount: '', currency: 'usd', expectedCloseOn: '2026-12-20', nextAction: ' Call buyer ' })).toMatchObject({ currency: 'USD', expectedCloseOn: '2026-12-20', nextAction: 'Call buyer' })
    expect(dealInput.safeParse({ name: 'Pilot', amount: '-20', currency: 'USD' }).success).toBe(false)
    expect(dealInput.safeParse({ name: 'Pilot', amount: '1234567890123', currency: 'USD' }).success).toBe(false)
    expect(dealInput.safeParse({ name: 'Pilot', amount: '', currency: 'USD', expectedCloseOn: '20-12-2026' }).success).toBe(false)
    expect(dealInput.safeParse({ name: 'Pilot', amount: '', currency: 'US' }).success).toBe(false)
  })

  it('requires task titles and offset-aware timestamps', () => {
    expect(taskInput.safeParse({ title: '  ', dueAt: '' }).success).toBe(false)
    expect(taskInput.parse({ title: 'Follow up', dueAt: '' }).dueAt).toBeNull()
    expect(taskInput.safeParse({ title: 'Follow up', dueAt: '2026-12-01T10:00:00' }).success).toBe(false)
  })

  it('accepts defined enrollment states and rejects ambiguous ones', () => {
    expect(enrollmentState.parse('waiting')).toBe('waiting')
    expect(enrollmentState.safeParse('delivered').success).toBe(false)
  })

  it('reports provider capabilities honestly instead of assuming support', () => {
    const provider = { providerKey: 'test-mail', capabilities: { protocol: 'imap_smtp', folders: true, moveMessages: false, flags: false, drafts: true, send: true, deliveryEvents: 'none', bounceEvents: false, complaintEvents: false, inboundWebhooks: false } } as EmailProviderAdapter
    expect(() => requireCapability(provider, 'deliveryEvents')).toThrowError(UnsupportedProviderCapabilityError)
    expect(() => requireCapability(provider, 'moveMessages')).toThrowError('does not support moveMessages')
  })

  it('normalizes and validates team invitations', () => {
    expect(parseTeamInvite({ email: '  USER@Example.com ', role: 'analyst' })).toEqual({ email: 'user@example.com', displayName: null, role: 'analyst' })
    expect(parseTeamInvite({ email: 'not-an-email', role: 'super_admin' })).toBeNull()
    expect(parseTeamInvite({ email: 'user@example.com', role: 'owner' })).toBeNull()
  })

  it('limits administrator role assignment to super administrators', () => {
    expect(canAssignMemberRole('sales_manager', 'analyst')).toBe(true)
    expect(canAssignMemberRole('sales_manager', 'super_admin')).toBe(false)
    expect(canAssignMemberRole('sales_representative', 'analyst')).toBe(false)
  })

  it('requires nonempty note text and trims it', () => {
    expect(noteInput.parse({ body: '  Follow up after demo  ' })).toEqual({ body: 'Follow up after demo' })
    expect(noteInput.safeParse({ body: '   ' }).success).toBe(false)
    expect(noteInput.safeParse({ body: 'x'.repeat(4001) }).success).toBe(false)
  })

  it('normalizes mailbox connection input without accepting unsafe credentials', () => {
    const valid = { organizationId: '123e4567-e89b-42d3-a456-426614174000', email: ' SALES@Example.com ', displayName: ' Sales ', password: 'password' }
    expect(parseMailboxInput(valid)).toEqual({ ...valid, email: 'sales@example.com', displayName: 'Sales' })
    expect(parseMailboxInput({ ...valid, organizationId: 'bad' })).toBeNull()
    expect(parseMailboxInput({ ...valid, email: 'not an email' })).toBeNull()
    expect(parseMailboxInput({ ...valid, password: 'bad\npassword' })).toBeNull()
    expect(parseMailboxInput({ ...valid, password: 'x'.repeat(1025) })).toBeNull()
    expect(parseMailboxInput({ ...valid, displayName: 'x'.repeat(121) })).toBeNull()
  })
})
