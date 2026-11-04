import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  AlertTriangle,
  Check,
  Inbox,
  LockKeyhole,
  MailPlus,
  Paperclip,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react'
import {
  MailboxApiError,
  connectMailbox,
  listMailboxes,
  syncMailbox,
  testMailbox,
  type MailboxSummary,
  type MailboxSyncResult,
} from '../lib/mailbox-api'
import { supabase } from '../lib/supabase'

type MessageParticipant = {
  participant_type: 'from' | 'to' | 'cc' | 'bcc' | 'reply_to'
  email_address: string
  display_name: string | null
  ordinal: number
}

type MessageAttachment = {
  filename: string
  content_type: string
  size_bytes: number
}

type StoredMessage = {
  id: string
  thread_id: string
  subject: string
  text_body: string | null
  html_body: string | null
  snippet: string
  received_at: string | null
  sent_at: string | null
  direction: string
  participants: MessageParticipant[] | null
  attachments: MessageAttachment[] | null
}

type StoredThread = {
  id: string
  normalized_subject: string
  latest_message_at: string | null
}

function formatBytes(value: number) {
  if (value < 1_024) return `${value} B`
  if (value < 1_048_576) return `${Math.round(value / 1_024)} KB`
  return `${(value / 1_048_576).toFixed(1)} MB`
}

function mailboxError(error: unknown, fallback: string) {
  return error instanceof MailboxApiError ? error.message : fallback
}

export function InboxPanel({ userId, canConnect }: { userId: string; canConnect: boolean }) {
  const [organizationId, setOrganizationId] = useState('')
  const [mailboxes, setMailboxes] = useState<MailboxSummary[]>([])
  const [selectedMailboxId, setSelectedMailboxId] = useState('')
  const [selectedThreadId, setSelectedThreadId] = useState('')
  const [bodyView, setBodyView] = useState<'text' | 'html'>('text')
  const [messages, setMessages] = useState<StoredMessage[]>([])
  const [threads, setThreads] = useState<StoredThread[]>([])
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [password, setPassword] = useState('')
  const [tested, setTested] = useState(false)
  const [loading, setLoading] = useState(true)
  const [messageLoading, setMessageLoading] = useState(false)
  const [busy, setBusy] = useState<'test' | 'connect' | 'refresh' | 'sync' | null>(null)
  const [syncResult, setSyncResult] = useState<MailboxSyncResult | null>(null)
  const [error, setError] = useState('')
  const [messageError, setMessageError] = useState('')
  const [message, setMessage] = useState('')
  const serviceConfigured = Boolean(import.meta.env.VITE_MAILBOX_WORKER_URL)

  const selectedMailbox = mailboxes.find(mailbox => mailbox.id === selectedMailboxId)
  const selectedThread = threads.find(thread => thread.id === selectedThreadId)
  const selectedMessages = useMemo(
    () => messages.filter(item => item.thread_id === selectedThreadId),
    [messages, selectedThreadId],
  )

  async function loadMailboxes(orgId: string) {
    const result = await listMailboxes(orgId)
    setMailboxes(result.mailboxes)
    if (!selectedMailboxId && result.mailboxes[0]) setSelectedMailboxId(result.mailboxes[0].id)
  }

  async function loadMessages(mailboxId: string) {
    if (!mailboxId) {
      setMessages([])
      setThreads([])
      setSelectedThreadId('')
      return
    }
    setMessageLoading(true)
    setMessageError('')
    try {
      const [threadResult, messageResult] = await Promise.all([
        supabase!.from('email_threads')
          .select('id,normalized_subject,latest_message_at')
          .eq('mailbox_account_id', mailboxId)
          .order('latest_message_at', { ascending: false })
          .limit(50),
        supabase!.from('email_messages')
          .select('id,thread_id,subject,text_body,html_body,snippet,received_at,sent_at,direction')
          .eq('mailbox_account_id', mailboxId)
          .order('received_at', { ascending: true, nullsFirst: false })
          .limit(200),
      ])
      if (threadResult.error || messageResult.error) throw threadResult.error ?? messageResult.error
      const loadedThreads = (threadResult.data ?? []) as StoredThread[]
      const loadedMessages = (messageResult.data ?? []) as Array<Omit<StoredMessage, 'participants' | 'attachments'>>
      const messageIds = loadedMessages.map(item => item.id)
      const [participantResult, attachmentResult] = messageIds.length
        ? await Promise.all([
          supabase!.from('email_message_participants')
            .select('message_id,participant_type,email_address,display_name,ordinal')
            .in('message_id', messageIds),
          supabase!.from('email_attachments')
            .select('message_id,filename,content_type,size_bytes')
            .in('message_id', messageIds),
        ])
        : [{ data: [], error: null }, { data: [], error: null }]
      if (participantResult.error || attachmentResult.error) throw participantResult.error ?? attachmentResult.error
      const participantsByMessage = new Map<string, StoredMessage['participants']>()
      for (const participant of participantResult.data ?? []) {
        const rows = participantsByMessage.get(participant.message_id) ?? []
        rows.push({ participant_type: participant.participant_type, email_address: participant.email_address, display_name: participant.display_name, ordinal: participant.ordinal })
        participantsByMessage.set(participant.message_id, rows)
      }
      const attachmentsByMessage = new Map<string, StoredMessage['attachments']>()
      for (const attachment of attachmentResult.data ?? []) {
        const rows = attachmentsByMessage.get(attachment.message_id) ?? []
        rows.push({ filename: attachment.filename, content_type: attachment.content_type, size_bytes: attachment.size_bytes })
        attachmentsByMessage.set(attachment.message_id, rows)
      }
      const mergedMessages = loadedMessages.map(item => ({
        ...item,
        participants: participantsByMessage.get(item.id) ?? [],
        attachments: attachmentsByMessage.get(item.id) ?? [],
      }))
      setThreads(loadedThreads)
      setMessages(mergedMessages)
      setSelectedThreadId(current => loadedThreads.some(thread => thread.id === current)
        ? current
        : loadedThreads[0]?.id ?? '')
    } catch (loadError) {
      // Surface the underlying Supabase/PostgREST error during development without changing the production-facing message.
      if (import.meta.env.DEV) console.error('Inbox loadMessages failed', loadError)
      setThreads([])
      setMessages([])
      setSelectedThreadId('')
      const serialized = (() => {
        try { return JSON.stringify(loadError) } catch { return String(loadError) }
      })()
      const backendError = loadError as { message?: string; code?: string; details?: string } | null
      const message = backendError?.message || (loadError instanceof Error ? loadError.message : serialized)
      setMessageError(`Inbox conversation load failed: ${message}. Raw: ${serialized.slice(0, 500)}. Verify mailbox permissions, schema, and authorized session.`)
    } finally {
      setMessageLoading(false)
    }
  }

  useEffect(() => {
    let active = true
    void (async () => {
      let membership
      try {
        const membershipQuery = supabase!.from('memberships').select('organization_id').eq('user_id', userId).limit(1).maybeSingle()
        const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Membership query timed out.')), 8000))
        membership = await Promise.race([membershipQuery, timeout])
      } catch (membershipError) {
        if (!active) return
        setError(membershipError instanceof Error ? membershipError.message : 'Membership could not be loaded.')
        setLoading(false)
        return
      }
      if (!active) return
      if (membership.error || !membership.data) { setError('Your account is not assigned to a workspace.'); setLoading(false); return }
      const orgId = membership.data.organization_id
      setOrganizationId(orgId)
      try {
        await loadMailboxes(orgId)
      } catch (loadError) {
        if (active) setError(mailboxError(loadError, 'Mailbox accounts could not be loaded.'))
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => { active = false }
  }, [userId])

  useEffect(() => {
    setBodyView('text')
  }, [selectedThreadId])

  useEffect(() => {
    if (selectedMailboxId) void loadMessages(selectedMailboxId)
  }, [selectedMailboxId])

  function updateField(setter: (value: string) => void, value: string) {
    setter(value)
    setTested(false)
    setMessage('')
  }

  function input() {
    return { organizationId, email, displayName, password }
  }

  async function runTest() {
    setError('')
    setMessage('')
    setBusy('test')
    try {
      const result = await testMailbox(input())
      setTested(true)
      setMessage(`IMAP ${result.imap.port} and SMTP ${result.smtp.port} authenticated. No email was sent.`)
    } catch (testError) {
      setTested(false)
      setError(mailboxError(testError, 'Mailbox connection could not be verified.'))
    } finally {
      setBusy(null)
    }
  }

  async function connect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setMessage('')
    setBusy('connect')
    try {
      const result = await connectMailbox(input())
      setMessage(`${result.email} is connected. Run the first inbox sync when ready.`)
      setPassword('')
      setTested(false)
      await loadMailboxes(organizationId)
      setSelectedMailboxId(result.mailboxId)
    } catch (saveError) {
      setError(mailboxError(saveError, 'Mailbox could not be connected.'))
    } finally {
      setBusy(null)
    }
  }

  async function refresh() {
    if (!organizationId) return
    setError('')
    setBusy('refresh')
    try {
      await loadMailboxes(organizationId)
      if (selectedMailboxId) await loadMessages(selectedMailboxId)
    } catch (loadError) {
      setError(mailboxError(loadError, 'Mailbox accounts could not be refreshed.'))
    } finally {
      setBusy(null)
    }
  }

  async function synchronize(mailboxId: string) {
    if (!organizationId) return
    setSelectedMailboxId(mailboxId)
    setBusy('sync')
    setSyncResult(null)
    setError('')
    try {
      const result = await syncMailbox(organizationId, mailboxId)
      setSyncResult(result)
      await Promise.all([loadMessages(mailboxId), loadMailboxes(organizationId)])
    } catch (syncError) {
      setError(mailboxError(syncError, 'Mailbox synchronization could not be completed.'))
    } finally {
      setBusy(null)
    }
  }

  return <div className="mailbox-layout">
    <section className="panel mailbox-panel mailbox-command-center">
      <header className="panel-heading">
        <div>
          <span className="section-kicker">Shared conversation workspace</span>
          <h2>Inbox command center</h2>
          <p>Read synchronized conversations, inspect mailbox health, and control incremental sync.</p>
        </div>
        <button className="secondary-button icon-button" type="button" onClick={() => void refresh()} disabled={busy !== null || loading} aria-label="Refresh inbox">
          <RefreshCw size={15} /> Refresh
        </button>
      </header>

      {error && <p className="inline-error" role="alert">{error}</p>}
      {syncResult && <p className="success-message" role="status"><Check size={15} />{syncResult.message}</p>}

      {loading ? <div className="table-message">Loading mailbox workspace…</div> : mailboxes.length ? <div className="mailbox-workspace">
        <aside className="mailbox-rail" aria-label="Connected mailboxes">
          <div className="mailbox-rail-label">Mailboxes</div>
          {mailboxes.map(mailbox => <button
            className={`mailbox-account-button ${selectedMailboxId === mailbox.id ? 'active' : ''}`}
            key={mailbox.id}
            type="button"
            onClick={() => setSelectedMailboxId(mailbox.id)}
          >
            <span className="mailbox-account-icon"><Inbox size={16} /></span>
            <span><b>{mailbox.display_name || mailbox.email_address}</b><small>{mailbox.email_address}</small></span>
            <i className={`health-dot ${mailbox.connection_state}`} aria-label={mailbox.connection_state.replaceAll('_', ' ')} />
          </button>)}
          {selectedMailbox && <div className="mailbox-rail-meta">
            <span>{selectedMailbox.last_sync_at ? `Last sync ${new Date(selectedMailbox.last_sync_at).toLocaleString()}` : 'Never synchronized'}</span>
            <button className="primary-button" type="button" onClick={() => void synchronize(selectedMailbox.id)} disabled={busy !== null}>
              <RefreshCw size={14} />{busy === 'sync' ? 'Syncing…' : 'Sync inbox'}
            </button>

          </div>}
        </aside>

        <div className="thread-list" aria-label="Conversation list">
          <div className="thread-list-heading"><b>Conversations</b><span>{threads.length}</span></div>
          {messageLoading ? <div className="table-message">Loading conversations…</div> : messageError ? <p className="inline-error" role="alert">{messageError}</p> : threads.length ? threads.map(thread => {
            const threadMessages = messages.filter(item => item.thread_id === thread.id)
            const latest = threadMessages.at(-1)
            const sender = latest?.participants?.find(participant => participant.participant_type === 'from')
            return <button className={`thread-button ${selectedThreadId === thread.id ? 'active' : ''}`} type="button" key={thread.id} onClick={() => setSelectedThreadId(thread.id)}>
              <span className="thread-avatar">{(sender?.display_name || sender?.email_address || '?').slice(0, 1).toUpperCase()}</span>
              <span><b>{sender?.display_name || sender?.email_address || 'Unknown sender'}</b><strong>{thread.normalized_subject || latest?.subject || '(No subject)'}</strong><small>{latest?.snippet || 'No message preview'}</small></span>
              <time>{thread.latest_message_at ? new Date(thread.latest_message_at).toLocaleDateString() : '—'}</time>
            </button>
          }) : <div className="mailbox-zero"><Inbox size={21} /><b>No synchronized conversations</b><span>Run an inbox sync to fetch the first bounded batch.</span></div>}
        </div>

        <article className="conversation-reader" aria-label="Conversation reader">
          {selectedThread ? <>
            <header className="conversation-heading"><span className="section-kicker">Conversation</span><h3>{selectedThread.normalized_subject || '(No subject)'}</h3><p>{selectedMessages.length} message{selectedMessages.length === 1 ? '' : 's'}{selectedMessages.some(item => item.html_body) ? <button type="button" className="secondary-button" onClick={() => setBodyView(current => current === 'text' ? 'html' : 'text')}>{bodyView === 'html' ? 'Show text' : 'Show HTML'}</button> : null}</p></header>
            <div className="conversation-stack">{selectedMessages.map(item => {
              const sender = item.participants?.find(participant => participant.participant_type === 'from')
              const recipients = item.participants?.filter(participant => participant.participant_type === 'to') ?? []
              const timestamp = item.received_at ?? item.sent_at
              return <section className="message-card" key={item.id}>
                <header><span className="thread-avatar">{(sender?.display_name || sender?.email_address || '?').slice(0, 1).toUpperCase()}</span><div><b>{sender?.display_name || sender?.email_address || 'Unknown sender'}</b><small>to {recipients.map(recipient => recipient.display_name || recipient.email_address).join(', ') || 'unknown'}</small></div><time>{timestamp ? new Date(timestamp).toLocaleString() : 'Unknown time'}</time></header>
                <div className="message-body">{bodyView === 'html' && item.html_body ? <iframe className="message-html-body" title={`HTML view of ${item.subject || 'message'}`} sandbox="" referrerPolicy="no-referrer" srcDoc={item.html_body} /> : (item.text_body || item.snippet || '(No readable body stored)')}</div>
                {item.attachments?.length ? <div className="attachment-list">{item.attachments.map(file => <span key={`${item.id}-${file.filename}`}><Paperclip size={13} />{file.filename}<small>{formatBytes(file.size_bytes)}</small></span>)}</div> : null}
              </section>
            })}</div>
            <div className="composer-locked"><LockKeyhole size={16} /><div><b>Outbound composer locked</b><span>Sending stays disabled until SMTP delivery, reconciliation, and bounce handling pass production verification.</span></div><button className="primary-button" type="button" disabled>Reply</button></div>
          </> : <div className="mailbox-zero reader-zero"><Inbox size={24} /><b>Select a conversation</b><span>The message body and attachment metadata will appear here.</span></div>}
        </article>
      </div> : <div className="mailbox-zero mailbox-empty-state"><MailPlus size={23} /><b>No mailbox connected</b><span>Connect a Hostinger custom-domain mailbox below to create the first inbox workspace.</span></div>}

      <div className="mailbox-boundary"><AlertTriangle size={15} /><span>Incremental inbound synchronization and read-only conversations are enabled. Sending, reply, draft persistence, and attachment download remain deliberately disabled.</span></div>
    </section>

    {canConnect && <section className="panel mailbox-panel mailbox-connect-panel">
      <header className="panel-heading"><div><span className="section-kicker">Secure connection</span><h2>Connect another mailbox</h2><p>Credentials are verified against IMAP and SMTP before encrypted storage.</p></div></header>
      {!serviceConfigured && <p className="inline-error" role="alert">Set <code>VITE_MAILBOX_WORKER_URL</code> to the trusted mailbox worker URL.</p>}
      {message && <p className="success-message" role="status"><Check size={15} />{message}</p>}
      <form className="contact-form mailbox-form" onSubmit={connect}>
        <label>Email address<input type="email" autoComplete="email" value={email} onChange={event => updateField(setEmail, event.target.value)} required maxLength={320} /></label>
        <label>Display name<input value={displayName} onChange={event => updateField(setDisplayName, event.target.value)} maxLength={120} placeholder="Optional" /></label>
        <label>Mailbox password<input type="password" autoComplete="new-password" value={password} onChange={event => updateField(setPassword, event.target.value)} required maxLength={1_024} /></label>
        <div className="mailbox-server-settings"><b>Incoming IMAP</b><span>imap.hostinger.com · 993 · implicit TLS</span><b>Outgoing SMTP</b><span>smtp.hostinger.com · 465 TLS (587 STARTTLS fallback)</span></div>
        <div className="mailbox-privacy"><LockKeyhole size={15} /><span>The worker receives this password over HTTPS and stores only an AES-GCM encrypted envelope.</span></div>
        <div className="mailbox-actions"><button className="secondary-button" type="button" onClick={() => void runTest()} disabled={!serviceConfigured || !organizationId || !email || !password || busy !== null}>{busy === 'test' ? 'Testing…' : 'Test connection'}</button><button className="primary-button" type="submit" disabled={!serviceConfigured || !organizationId || !email || !password || !tested || busy !== null}>{busy === 'connect' ? 'Connecting…' : 'Connect mailbox'}</button></div>
      </form>
    </section>}

    {!canConnect && <div className="data-note"><ShieldCheck size={15} /><span>Your role can read authorized mailbox data but cannot connect a mailbox.</span></div>}
  </div>
}
