import { describe, expect, it } from 'vitest'
import { parseMailboxInput } from '../workers/mailbox/src/input.ts'

const ORG = '11111111-1111-4111-8111-111111111111'

describe('mailbox input validation', () => {
  it('accepts a well-formed payload', () => {
    expect(parseMailboxInput({ organizationId: ORG, email: '  Sales@Example.com ', password: 'secret', displayName: '  Sales team  ' })).toEqual({
      organizationId: ORG,
      email: 'sales@example.com',
      password: 'secret',
      displayName: 'Sales team',
    })
  })

  it('rejects malformed organizations, emails, passwords and long fields', () => {
    expect(parseMailboxInput({ organizationId: 'not-a-uuid', email: 'x@y', password: 'p', displayName: '' })).toBeNull()
    expect(parseMailboxInput({ organizationId: ORG, email: 'user@example.com', password: '', displayName: '' })).toBeNull()
    expect(parseMailboxInput({ organizationId: ORG, email: 'user@example.com', password: 'bad\r\npassword', displayName: '' })).toBeNull()
    expect(parseMailboxInput({ organizationId: ORG, email: 'user@example.com', password: 'p', displayName: 'a'.repeat(121) })).toBeNull()
    expect(parseMailboxInput(null)).toBeNull()
  })
})
