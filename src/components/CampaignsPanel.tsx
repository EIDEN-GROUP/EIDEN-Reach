import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'

type Campaign = { id: string; name: string; category: string; industry?: string | null; status: string; scheduled_at: string | null; sender_mailbox_id: string | null; sequence_id: string | null; archived_at: string | null }
type Mailbox = { id: string; email_address: string; connection_state: string }
type Sequence = { id: string; name: string }

export function CampaignsPanel({ userId, canWrite }: { userId: string; canWrite: boolean }) {
  const [orgId, setOrgId] = useState('')
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([])
  const [sequences, setSequences] = useState<Sequence[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [name, setName] = useState('')
  const [industry, setIndustry] = useState('')
  const [industries, setIndustries] = useState<string[]>([])
  const [senderMailboxId, setSenderMailboxId] = useState('')
  const [sequenceId, setSequenceId] = useState('')
  const [draft, setDraft] = useState({ name: '', category: 'sales', industry: '', status: 'draft', senderMailboxId: '', sequenceId: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void (async () => {
      const membership = await supabase!.from('memberships').select('organization_id').eq('user_id', userId).limit(1).maybeSingle()
      if (!active) return
      if (membership.error || !membership.data) { setError('Your account is not assigned to a workspace.'); setLoading(false); return }
      setOrgId(membership.data.organization_id)
      void (async () => { const iRes = await supabase!.from('industry_categories').select('name').eq('organization_id', membership.data!.organization_id).is('archived_at', null).order('name'); if (!iRes.error && iRes.data) setIndustries(iRes.data.map((r: { name: string }) => r.name)) })()
      const [campRes, mbRes, seqRes] = await Promise.all([
        supabase!.from('campaigns').select('id,name,category,industry,status,scheduled_at,sender_mailbox_id,sequence_id,archived_at').eq('organization_id', membership.data.organization_id).is('archived_at', null).order('name'),
        supabase!.from('mailbox_accounts').select('id,email_address,connection_state').eq('organization_id', membership.data.organization_id).is('disconnected_at', null).order('email_address'),
        supabase!.from('sequences').select('id,name').eq('organization_id', membership.data.organization_id).is('archived_at', null).order('name'),
      ])
      if (!active) return
      if (campRes.error || mbRes.error || seqRes.error) setError('Campaigns, mailboxes or sequences could not be loaded.')
      else { setCampaigns(campRes.data ?? []); setMailboxes(mbRes.data ?? []); setSequences(seqRes.data ?? []) }
      setLoading(false)
    })()
    return () => { active = false }
  }, [userId])

  const selected = campaigns.find(c => c.id === selectedId)

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canWrite || !orgId || !name.trim()) return
    setSaving(true)
    setError('')
    const result = await supabase!.from('campaigns').insert({ organization_id: orgId, owner_id: userId, name: name.trim(), category: 'sales', industry: industry, sender_mailbox_id: senderMailboxId || null, sequence_id: sequenceId || null, status: 'draft' }).select('id,name,category,industry,status,scheduled_at,sender_mailbox_id,sequence_id,archived_at').single()
    if (result.error) setError(`Campaign could not be created: ${result.error.code ?? ''} ${result.error.message ?? ''} ${result.error.details ?? ''}`.trim())
    else { setCampaigns(current => [...current, result.data as Campaign].sort((a, b) => a.name.localeCompare(b.name))); setName(''); setIndustry(''); setSenderMailboxId(''); setSequenceId('') }
    setSaving(false)
  }

  function select(c: Campaign) {
    setSelectedId(c.id)
    setDraft({ name: c.name, category: 'sales', industry: c.industry ?? c.category ?? '', status: c.status, senderMailboxId: c.sender_mailbox_id ?? '', sequenceId: c.sequence_id ?? '' })
  }

  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canWrite || !selected) return
    setSaving(true)
    setError('')
    const result = await supabase!.from('campaigns').update({ name: draft.name.trim(), category: 'sales', industry: draft.industry, status: draft.status, sender_mailbox_id: draft.senderMailboxId || null, sequence_id: draft.sequenceId || null }).eq('id', selected.id).eq('organization_id', orgId).select('id,name,category,industry,status,scheduled_at,sender_mailbox_id,sequence_id,archived_at').single()
    if (result.error) setError('Campaign changes could not be saved.')
    else { setCampaigns(current => current.map(c => c.id === selected.id ? result.data as Campaign : c).sort((a, b) => a.name.localeCompare(b.name))); setSelectedId(result.data.id) }
    setSaving(false)
  }

  async function archive(c: Campaign) {
    if (!canWrite || !window.confirm(`Archive ${c.name}?`)) return
    setSaving(true)
    setError('')
    const result = await supabase!.from('campaigns').update({ archived_at: new Date().toISOString(), status: 'cancelled' }).eq('id', c.id).eq('organization_id', orgId)
    if (result.error) setError('Campaign could not be archived.')
    else { setCampaigns(current => current.filter(x => x.id !== c.id)); if (selectedId === c.id) setSelectedId('') }
    setSaving(false)
  }

  return <section className="panel contacts-panel">
    <div className="panel-heading"><div><h2>Campaigns</h2><p>Audience, sender and schedule review before launch. Sending is not enabled.</p></div></div>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {canWrite && <form className="contact-form" onSubmit={create}>
      <label>Name<input value={name} onChange={e => setName(e.target.value)} required maxLength={200} /></label>
      <label>Industry<select value={industry} onChange={e => setIndustry(e.target.value)}><option value="">No industry</option>{industries.map(ic => <option key={ic} value={ic}>{ic}</option>)}</select></label>
      <label>Sender mailbox<select value={senderMailboxId} onChange={e => setSenderMailboxId(e.target.value)}><option value="">None</option>{mailboxes.map(m => <option key={m.id} value={m.id}>{m.email_address}</option>)}</select></label>
      <label>Sequence<select value={sequenceId} onChange={e => setSequenceId(e.target.value)}><option value="">None</option>{sequences.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <button className="primary-button" disabled={saving || !orgId}>{saving ? 'Saving...' : 'Create campaign'}</button>
    </form>}
    {loading ? <div className="table-message">Loading campaigns...</div> : campaigns.length ? <div className="contact-table-wrap"><table className="contact-table"><thead><tr><th>Name</th><th>Industry</th><th>Status</th><th>Action</th></tr></thead><tbody>{campaigns.map(c => <tr key={c.id}><td><button className="text-action" onClick={() => select(c)}>{c.name}</button></td><td>{c.category === 'sales' || c.category === 'marketing' ? (c.industry || '—') : c.category}</td><td>{c.status}</td><td>{canWrite && <button className="archive-button" type="button" onClick={() => void archive(c)}>Archive</button>}</td></tr>)}</tbody></table></div> : !error && <div className="table-message">No campaigns yet. {canWrite ? 'Create one above.' : 'No campaigns are available.'}</div>}
    {selected && <section className="contact-editor" aria-label="Campaign details">
      <div className="editor-heading"><div><h3>{selected.name}</h3><p>Campaign · {selected.status}</p></div><button className="secondary-button" type="button" onClick={() => setSelectedId('')}>Close</button></div>
      {canWrite ? <form className="contact-form" onSubmit={update}>
        <label>Name<input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} required maxLength={200} /></label>
        <label>Industry<select value={draft.industry} onChange={e => setDraft({ ...draft, industry: e.target.value })}><option value="">No industry</option>{industries.map(ic => <option key={ic} value={ic}>{ic}</option>)}</select></label>
        <label>Status<select value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value })}><option value="draft">draft</option><option value="preflight">preflight</option><option value="paused">paused</option><option value="cancelled">cancelled</option><option value="approved" disabled>approved (managed)</option><option value="scheduled" disabled>scheduled (managed)</option><option value="sending" disabled>sending (worker)</option><option value="completed" disabled>completed (worker)</option></select></label>
        <label>Sender mailbox<select value={draft.senderMailboxId} onChange={e => setDraft({ ...draft, senderMailboxId: e.target.value })}><option value="">None</option>{mailboxes.map(m => <option key={m.id} value={m.id}>{m.email_address}</option>)}</select></label>
        <label>Sequence<select value={draft.sequenceId} onChange={e => setDraft({ ...draft, sequenceId: e.target.value })}><option value="">None</option>{sequences.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        <button className="primary-button" disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</button>
      </form> : <dl className="contact-readonly"><dt>Category</dt><dd>{selected.category}</dd><dt>Status</dt><dd>{selected.status}</dd></dl>}
    </section>}
  </section>
}
