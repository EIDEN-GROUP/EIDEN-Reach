import { describe, expect, it } from 'vitest'
import PostalMime from 'postal-mime'
import { mapParsedEmail } from '../workers/mailbox/src/mail-mapping.ts'

const raw = [
  'From: "Ada Lovelace" <ada@example.com>',
  'To: Sales <sales@eiden.example>',
  'Cc: Charles <charles@example.com>',
  'Subject: Re: Analytical engine proposal',
  'Message-ID: <reply@example.com>',
  'In-Reply-To: <root@example.com>',
  'References: <root@example.com> <previous@example.com>',
  'Date: Thu, 29 Oct 2026 10:30:00 +0000',
  'Content-Type: text/plain; charset=utf-8',
  '',
  'Please send the revised proposal.',
].join('\r\n')

describe('mail persistence mapping', () => {
  it('maps a parsed message into tenant-safe message and participant rows', async () => {
    const parsed = await PostalMime.parse(raw)
    const mapped = mapParsedEmail(parsed, {
      organizationId: '11111111-1111-4111-8111-111111111111',
      mailboxId: '22222222-2222-4222-8222-222222222222',
      folderProviderId: 'INBOX',
      uid: 42,
    })

    expect(mapped.threadProviderId).toBe('<root@example.com>')
    expect(mapped.providerMessageKey).toBe('<reply@example.com>')
    expect(mapped.message).toMatchObject({
      direction: 'inbound',
      rfc_message_id: '<reply@example.com>',
      in_reply_to: '<root@example.com>',
      subject: 'Re: Analytical engine proposal',
      text_body: 'Please send the revised proposal.',
    })
    expect(mapped.message.references_header).toEqual(['<root@example.com>', '<previous@example.com>'])
    expect(mapped.participants).toEqual(expect.arrayContaining([
      expect.objectContaining({ participant_type: 'from', email_address: 'ada@example.com', display_name: 'Ada Lovelace' }),
      expect.objectContaining({ participant_type: 'to', email_address: 'sales@eiden.example' }),
      expect.objectContaining({ participant_type: 'cc', email_address: 'charles@example.com' }),
    ]))
  })

  it('bounds stored bodies and headers', async () => {
    const parsed = await PostalMime.parse(raw.replace('Please send the revised proposal.', 'x'.repeat(300_000)))
    const mapped = mapParsedEmail(parsed, {
      organizationId: '11111111-1111-4111-8111-111111111111',
      mailboxId: '22222222-2222-4222-8222-222222222222',
      folderProviderId: 'INBOX',
      uid: 43,
    })

    expect(mapped.message.text_body?.length).toBeLessThanOrEqual(200_000)
    expect(JSON.stringify(mapped.message.raw_headers).length).toBeLessThan(64_000)
  })
})
