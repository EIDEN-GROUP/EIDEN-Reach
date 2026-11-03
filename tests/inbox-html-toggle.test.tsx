/**
 * @vitest-environment jsdom
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import '@testing-library/jest-dom/vitest'
import { InboxPanel } from '../src/components/InboxPanel'

vi.mock('../src/lib/supabase', () => {
  const threads = [{ id: 'thread-1', normalized_subject: 'Subject', latest_message_at: '2026-10-30T10:00:00.000Z' }]
  const messages = [{
    id: 'message-1', thread_id: 'thread-1', subject: 'Hello', text_body: 'plain text',
    html_body: '<p>trusted <strong>HTML</strong></p>', snippet: 'plain text',
    received_at: '2026-10-30T10:00:00.000Z', sent_at: null, direction: 'inbound',
    participants: [{ participant_type: 'from', email_address: 'sender@example.com', display_name: 'Sender', ordinal: 0 },
      { participant_type: 'to', email_address: 'me@example.com', display_name: 'Me', ordinal: 0 }],
    attachments: [],
  }]
  const makeQuery = (table: string) => {
    const data = table === 'memberships' ? [{ organization_id: 'org-1' }]
      : table === 'email_threads' ? threads : messages
    const chain: any = {}
    const methods = ['select', 'eq', 'is', 'in', 'order', 'limit', 'single', 'maybeSingle']
    for (const method of methods) chain[method] = () => chain
    chain.then = (resolve: (value: unknown) => void) => Promise.resolve({ data, error: null, count: data.length }).then(resolve)
    return chain
  }
  return {
    supabase: {
      from: (table: string) => makeQuery(table),
      auth: { getSession: vi.fn(async () => ({ data: { session: { access_token: 'token' } } })) },
    },
    databaseConfigured: true,
  }
})

vi.mock('../src/lib/mailbox-api', () => ({
  MailboxApiError: class extends Error {},
  listMailboxes: vi.fn(async () => ({
    mailboxes: [{
      id: 'mailbox-1', owner_id: 'user-1', provider_key: 'hostinger', email_address: 'me@example.com',
      display_name: 'Sales mailbox', connection_state: 'connected', last_sync_at: null,
      last_error_code: null, created_at: '2026-10-30T09:00:00.000Z', imap_host: 'imap.hostinger.com',
      imap_port: 993, imap_tls_mode: 'implicit_tls', smtp_host: 'smtp.hostinger.com', smtp_port: 465, smtp_tls_mode: 'implicit_tls',
    }],
  })),
  testMailbox: vi.fn(),
  connectMailbox: vi.fn(),
  syncMailbox: vi.fn(async () => ({ ok: true, mailboxId: 'mailbox-1', folders: [], synchronizedMessages: 1, hasMore: false, message: 'Synchronized 1 messages.' })),
}))

describe('Inbox HTML rendering', () => {
  it('toggles between text and sandboxed HTML without enabling scripts', async () => {
    const user = userEvent.setup()
    const { container } = render(<InboxPanel userId="user-1" canConnect={false} />)

    await waitFor(() => expect(screen.getByText(/Sales mailbox/i)).toBeInTheDocument())
    await waitFor(() => expect((container.querySelector('.message-body') as HTMLElement)?.textContent).toBe('plain text'))

    await user.click(screen.getByRole('button', { name: /show html/i }))
    const iframe = screen.getByTitle(/HTML view/i) as HTMLIFrameElement
    expect(iframe.getAttribute('sandbox')).toBe('')
    expect(iframe.srcdoc).toContain('trusted')

    await user.click(screen.getByRole('button', { name: /show text/i }))
    expect((container.querySelector('.message-body') as HTMLElement)?.textContent).toBe('plain text')
  })
})
