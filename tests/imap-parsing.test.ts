import { describe, expect, it } from 'vitest'
import {
  deriveThreadProviderId,
  parseImapListLine,
  parseImapSearchLine,
  parseMessageIds,
} from '../workers/mailbox/src/imap-parsing.ts'

describe('IMAP response parsing', () => {
  it('parses quoted and NIL-delimiter LIST responses', () => {
    expect(parseImapListLine('* LIST (\\HasNoChildren \\Inbox) "/" "INBOX"')).toEqual({
      name: 'INBOX',
      specialUse: 'inbox',
    })
    expect(parseImapListLine('* LIST (\\HasNoChildren) NIL Archive')).toEqual({
      name: 'Archive',
      specialUse: undefined,
    })
  })

  it('ignores malformed LIST responses and non-selectable folders', () => {
    expect(parseImapListLine('* OK ready')).toBeNull()
    expect(parseImapListLine('* LIST (\\Noselect) "/" "Folder"')).toBeNull()
  })

  it('parses and normalizes UID SEARCH responses', () => {
    expect(parseImapSearchLine('* SEARCH 42 7 42 100')).toEqual([7, 42, 100])
    expect(parseImapSearchLine('* SEARCH')).toEqual([])
    expect(parseImapSearchLine('A003 OK Search completed')).toBeNull()
  })
})

describe('message threading helpers', () => {
  it('extracts RFC message identifiers from folded reference headers', () => {
    expect(parseMessageIds('<root@example.com>\r\n\t<child@example.com>')).toEqual([
      '<root@example.com>',
      '<child@example.com>',
    ])
  })

  it('prefers the root reference, then in-reply-to, then message id', () => {
    expect(deriveThreadProviderId({
      messageId: '<message@example.com>',
      inReplyTo: '<parent@example.com>',
      references: '<root@example.com> <parent@example.com>',
    })).toBe('<root@example.com>')
    expect(deriveThreadProviderId({ messageId: '<message@example.com>', inReplyTo: '<parent@example.com>' }))
      .toBe('<parent@example.com>')
    expect(deriveThreadProviderId({ messageId: '<message@example.com>' })).toBe('<message@example.com>')
  })
})
