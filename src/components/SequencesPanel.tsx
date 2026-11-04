import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { AlertTriangle, CheckCircle2, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { EntityPage, RailCard, SlideOut } from './Overlay'

type Sequence = { id: string; name: string; description: string | null; status: string; category: string; current_version: number; daily_limit: number | null; archived_at: string | null; sender_mailbox_id: string | null }
type Step = { id: string; position: number; kind: string; delay_minutes: number; business_days_only: boolean; time_zone_policy: string; template_id: string | null }
type Enrollment = { id: string; contact_id: string; state: string; enrolled_at: string; next_step_position: number; next_run_at: string | null; stopped_at: string | null; stop_reason: string | null; contacts: { first_name: string; last_name: string; email: string | null } | null }
type Mailbox = { id: string; email_address: string; display_name: string | null }
type Contact = { id: string; first_name: string; last_name: string; email: string | null }

const SEQUENCE_COLUMNS = 'id,name,description,status,category,current_version,daily_limit,archived_at,sender_mailbox_id'

export function SequencesPanel({ userId, canWrite }: { userId: string; canWrite: boolean }) {
  const [orgId, setOrgId] = useState('')
  const [sequences, setSequences] = useState<Sequence[]>([])
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [steps, setSteps] = useState<Step[]>([])
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('sales')
  const [draft, setDraft] = useState({ name: '', description: '', status: 'draft', dailyLimit: '', senderMailboxId: '' })
  const [templateLoading, setTemplateLoading] = useState(false)
  const [enrollOpen, setEnrollOpen] = useState(false)
  const [stepOpen, setStepOpen] = useState(false)
  const [enrollContactId, setEnrollContactId] = useState('')
  const [enrollError, setEnrollError] = useState('')
  const [stepKind, setStepKind] = useState('email')
  const [stepDelay, setStepDelay] = useState('0')
  const [stepBusinessDays, setStepBusinessDays] = useState(false)
  const [stepTimeZonePolicy, setStepTimeZonePolicy] = useState('contact')
  const [stepTemplateId, setStepTemplateId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void (async () => {
      const membership = await supabase!.from('memberships').select('organization_id').eq('user_id', userId).limit(1).maybeSingle()
      if (!active) return
      if (membership.error || !membership.data) { setError('Your account is not assigned to a workspace.'); setLoading(false); return }
      const organizationId = membership.data.organization_id
      setOrgId(organizationId)
      const [seqRes, tplRes] = await Promise.all([
        supabase!.from('sequences').select(SEQUENCE_COLUMNS).eq('organization_id', organizationId).is('archived_at', null).order('name'),
        supabase!.from('email_templates').select('id,name').eq('organization_id', organizationId).is('archived_at', null).order('name'),
      ])
      if (!active) return
      if (seqRes.error || tplRes.error) setError('Sequences or templates could not be loaded.')
      else { setSequences(seqRes.data ?? []); setTemplates(tplRes.data ?? []) }
      setLoading(false)

      const [mailboxRes, contactRes] = await Promise.all([
        supabase!.from('mailbox_accounts').select('id,email_address,display_name').eq('organization_id', organizationId).is('disconnected_at', null).order('created_at'),
        supabase!.from('contacts').select('id,first_name,last_name,email').eq('organization_id', organizationId).is('archived_at', null).limit(500).order('first_name'),
      ])
      if (!active) return
      if (mailboxRes.error) setError('Mailboxes could not be loaded.')
      else setMailboxes(mailboxRes.data ?? [])
      if (contactRes.error) setError('Contacts could not be loaded.')
      else setContacts(contactRes.data ?? [])
    })()
    return () => { active = false }
  }, [userId])

  useEffect(() => {
    if (!selectedId) { setSteps([]); return }
    const seq = sequences.find(s => s.id === selectedId)
    if (!seq) { setSteps([]); return }
    let active = true
    void (async () => {
      const result = await supabase!.from('sequence_steps').select('id,position,kind,delay_minutes,business_days_only,time_zone_policy,template_id').eq('sequence_id', selectedId).eq('version', seq.current_version).order('position')
      if (!active) return
      if (result.error) setError('Steps could not be loaded.')
      else setSteps(result.data ?? [])
    })()
    return () => { active = false }
  }, [selectedId, sequences])

  useEffect(() => {
    if (!selectedId) { setEnrollments([]); return }
    let active = true
    void (async () => {
      const result = await supabase!.from('sequence_enrollments')
        .select('id,contact_id,state,enrolled_at,next_step_position,next_run_at,stopped_at,stop_reason,contacts:contact_id(first_name,last_name,email)')
        .eq('sequence_id', selectedId)
        .order('enrolled_at', { ascending: false })
        .limit(500)
      if (!active) return
      if (result.error) setError('Enrollments could not be loaded.')
      else setEnrollments((result.data ?? []) as unknown as Enrollment[])
    })()
    return () => { active = false }
  }, [selectedId])

  const selected = sequences.find(s => s.id === selectedId)

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canWrite || !orgId || !name.trim()) return
    setSaving(true)
    setError('')
    const sequenceResult = await supabase!.rpc('create_sequence_with_version', {
      target_organization: orgId,
      target_name: name.trim(),
      target_description: description.trim(),
      target_category: category,
    }).single()
    if (sequenceResult.error) {
      setError(sequenceResult.error.code === '23505' ? 'A sequence with that name already exists.' : 'Sequence could not be initialized.')
    } else {
      setSequences(current => [...current, sequenceResult.data as Sequence].sort((a, b) => a.name.localeCompare(b.name)))
      setName(''); setDescription(''); setCategory('sales')
      setCreateOpen(false)
    }
    setSaving(false)
  }

  function select(seq: Sequence) {
    setSelectedId(seq.id)
    setDraft({ name: seq.name, description: seq.description ?? '', status: seq.status, dailyLimit: seq.daily_limit?.toString() ?? '', senderMailboxId: seq.sender_mailbox_id ?? '' })
  }

  function closeRecord() { setSelectedId('') }

  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canWrite || !selected) return
    setSaving(true)
    setError('')
    const dailyLimit = draft.dailyLimit ? Number(draft.dailyLimit) : null
    if (dailyLimit !== null && (!Number.isInteger(dailyLimit) || dailyLimit <= 0)) {
      setError('Daily limit must be a positive whole number.')
      setSaving(false)
      return
    }
    const result = await supabase!.from('sequences').update({ name: draft.name.trim(), description: draft.description.trim() || null, status: draft.status, daily_limit: dailyLimit, sender_mailbox_id: draft.senderMailboxId || null }).eq('id', selected.id).eq('organization_id', orgId).select(SEQUENCE_COLUMNS).single()
    if (result.error) {
      const message = result.error.message
      setError(message.includes('at least one step') ? 'Add at least one step before activating this sequence.' : message.includes('requires a template') ? 'Every email step needs a template before activation.' : 'Sequence changes could not be saved.')
    } else {
      setSequences(current => current.map(s => s.id === selected.id ? result.data as Sequence : s).sort((a, b) => a.name.localeCompare(b.name)))
      select(result.data as Sequence)
    }
    setSaving(false)
  }

  async function archive(seq: Sequence) {
    if (!canWrite || !window.confirm(`Archive ${seq.name}?`)) return
    setSaving(true)
    setError('')
    const result = await supabase!.from('sequences').update({ archived_at: new Date().toISOString(), status: 'archived' }).eq('id', seq.id).eq('organization_id', orgId)
    if (result.error) setError('Sequence could not be archived.')
    else { setSequences(current => current.filter(s => s.id !== seq.id)); if (selectedId === seq.id) setSelectedId('') }
    setSaving(false)
  }

  async function useStandardTemplate() {
    if (!canWrite || !orgId) return
    setTemplateLoading(true)
    setError('')
    try {
      const stepsSpec = [
        { day: 1, subject: 'A possible opportunity for {{company}}', template: 'MeetIntroDay1' },
        { day: 4, subject: 'Re: A possible opportunity for {{company}}', template: 'MeetFollow1Day4' },
        { day: 8, subject: 'An idea for {{company}}', template: 'MeetValueDay8' },
        { day: 13, subject: 'Is this something you are considering?', template: 'MeetObjDay13' },
        { day: 20, subject: 'Should I close this for now?', template: 'MeetCloseDay20' },
      ]
      const templateIds: Record<number, string> = {}
      for (const spec of stepsSpec) {
        const fetched = await supabase!.from('email_templates').select('id').eq('organization_id', orgId).eq('name', spec.template).maybeSingle()
        let id = fetched.data?.id
        if (!id) {
          const inserted = await supabase!.from('email_templates').insert({ organization_id: orgId, owner_id: userId, name: spec.template, subject: spec.subject, text_body: `Hi {{first_name}},\n\nThis is a personal follow-up for your company {{company}}.\n\nBest regards,\n{{sender_name}}`, category: 'sales' }).select('id').single()
          if (inserted.error) throw inserted.error
          id = inserted.data.id
        }
        templateIds[spec.day] = id
      }
      const seqRes = await supabase!.rpc('create_sequence_with_version', { target_organization: orgId, target_name: 'Standard B2B Outreach', target_description: 'Five-email default: Days 1, 4, 8, 13, 20. Stop on reply.', target_category: 'sales' }).single()
      if (seqRes.error) throw seqRes.error
      const newSeqId = (seqRes.data as { id: string }).id
      let prevDay = 1
      for (let i = 0; i < stepsSpec.length; i++) {
        const spec = stepsSpec[i]
        const delay = i === 0 ? 0 : (spec.day - prevDay) * 24 * 60
        prevDay = spec.day
        const inserted = await supabase!.from('sequence_steps').insert({ sequence_id: newSeqId, version: 1, position: i, kind: 'email', delay_minutes: delay, business_days_only: true, time_zone_policy: 'contact', template_id: templateIds[spec.day], configuration: {} })
        if (inserted.error) throw inserted.error
      }
      const fetched = await supabase!.from('sequences').select(SEQUENCE_COLUMNS).eq('id', newSeqId).maybeSingle()
      if (fetched.data) {
        const created = fetched.data as Sequence
        setSequences(current => [...current, created].sort((a, b) => a.name.localeCompare(b.name)))
        select(created)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Standard template could not be created.')
    } finally {
      setTemplateLoading(false)
    }
  }

  async function addStep() {
    if (!canWrite || !selected || selected.status !== 'draft') return
    const position = steps.length
    setSaving(true)
    setError('')
    const result = await supabase!.from('sequence_steps').insert({ sequence_id: selected.id, version: selected.current_version, position, kind: stepKind, delay_minutes: Number(stepDelay) || 0, business_days_only: stepBusinessDays, time_zone_policy: stepTimeZonePolicy, template_id: stepTemplateId || null, configuration: {} }).select('id,position,kind,delay_minutes,business_days_only,time_zone_policy,template_id').single()
    if (result.error) setError('Step could not be added.')
    else { setSteps(current => [...current, result.data as Step].sort((a, b) => a.position - b.position)); setStepOpen(false) }
    setSaving(false)
  }

  async function removeStep(step: Step) {
    if (!canWrite || selected?.status !== 'draft' || !window.confirm('Delete this step?')) return
    setSaving(true)
    setError('')
    const result = await supabase!.from('sequence_steps').delete().eq('id', step.id)
    if (result.error) setError('Step could not be deleted.')
    else setSteps(current => current.filter(s => s.id !== step.id))
    setSaving(false)
  }

  async function enrollContact() {
    if (!canWrite || !selected || !enrollContactId) return
    setEnrollError('')
    const duplicate = enrollments.some(enrollment => enrollment.contact_id === enrollContactId && ['pending', 'active', 'waiting', 'sending', 'paused'].includes(enrollment.state))
    if (duplicate) { setEnrollError('Contact already enrolled and active in this sequence.'); return }
    setSaving(true)
    try {
      const inserted = await supabase!.from('sequence_enrollments').insert({
        organization_id: orgId,
        sequence_id: selected.id,
        sequence_version: selected.current_version,
        contact_id: enrollContactId,
        owner_id: userId,
        state: 'active',
        enrolled_at: new Date().toISOString(),
        next_step_position: 0,
        next_run_at: new Date().toISOString(),
        created_by: userId,
      }).select('id,contact_id,state,enrolled_at,next_step_position,next_run_at,stopped_at,stop_reason,contacts:contact_id(first_name,last_name,email)').single()
      if (inserted.error) {
        if (inserted.error.message.includes('violation') || inserted.error.message.includes('duplicate')) setEnrollError('Contact already enrolled in this sequence.')
        else setEnrollError(inserted.error.message)
      } else {
        setEnrollments(current => [inserted.data as unknown as Enrollment, ...current])
        setEnrollContactId('')
        setEnrollOpen(false)
      }
    } finally {
      setSaving(false)
    }
  }

  function stateClass(state: string) {
    switch (state) {
      case 'replied': return 'status-chip status-chip-replied'
      case 'active': return 'status-chip status-chip-active'
      case 'paused': return 'status-chip status-chip-paused'
      case 'pending': return 'status-chip status-chip-pending'
      case 'completed': return 'status-chip status-chip-completed'
      case 'unsubscribed': return 'status-chip status-chip-unsubscribed'
      case 'bounced': return 'status-chip status-chip-bounced'
      default: return 'status-chip'
    }
  }

  const enrollmentSummary = {
    total: enrollments.length,
    active: enrollments.filter(e => ['pending', 'active', 'waiting', 'sending'].includes(e.state)).length,
    replied: enrollments.filter(e => e.state === 'replied').length,
    paused: enrollments.filter(e => e.state === 'paused').length,
    completed: enrollments.filter(e => e.state === 'completed').length,
  }

  const senderId = draft.senderMailboxId || selected?.sender_mailbox_id || ''
  const senderMailbox = mailboxes.find(m => m.id === senderId)
  const preflight = selected ? [
    { label: 'Sender', ok: !!senderId, detail: senderMailbox?.email_address ?? 'No mailbox selected' },
    { label: 'Mailbox', ok: mailboxes.length > 0, detail: mailboxes.length ? `${mailboxes.length} connected` : 'No mailbox connected' },
    { label: 'Status', ok: selected.status === 'active', detail: selected.status },
    { label: 'Steps', ok: steps.length > 0, detail: `${steps.length} step(s), ${steps.filter(s => s.kind === 'email').length} email(s)` },
    { label: 'Daily limit', ok: !draft.dailyLimit || (Number.isInteger(Number(draft.dailyLimit)) && Number(draft.dailyLimit) > 0), detail: draft.dailyLimit ? `${draft.dailyLimit} per day` : 'No limit set' },
    { label: 'Enrollments', ok: enrollments.length > 0, detail: `${enrollmentSummary.total} total, ${enrollmentSummary.active} active, ${enrollmentSummary.replied} replied` },
    { label: 'Stop rules', ok: true, detail: 'Stop on reply, bounce or unsubscribe. Pause on out-of-office.' },
  ] : []

  const templateName = (id: string | null) => (id ? templates.find(t => t.id === id)?.name ?? 'Template' : 'No template')

  return <section className="panel sequences-panel">
    <div className="panel-heading">
      <div><h2>Sequences</h2><p>Multi-step follow-up that stops automatically when a contact replies.</p></div>
      {canWrite && <div className="panel-actions">
        <button className="secondary-button" type="button" disabled={saving || templateLoading || !orgId} onClick={() => void useStandardTemplate()}>{templateLoading ? 'Creating…' : 'Use 5-email template'}</button>
        <button className="primary-button" type="button" disabled={!orgId} onClick={() => setCreateOpen(true)}><Plus size={15} /> New sequence</button>
      </div>}
    </div>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {loading ? <div className="table-message">Loading sequences...</div> : sequences.length ? <div className="contact-table-wrap"><table className="contact-table">
      <thead><tr><th>Name</th><th>Status</th><th>Version</th><th aria-label="Actions" /></tr></thead>
      <tbody>{sequences.map(seq => <tr key={seq.id}>
        <td><button className="text-action" type="button" onClick={() => select(seq)}>{seq.name}</button></td>
        <td><span className={stateClass(seq.status === 'active' ? 'active' : seq.status === 'paused' ? 'paused' : 'pending')}>{seq.status}</span></td>
        <td>v{seq.current_version}</td>
        <td className="row-actions">{canWrite && <button className="archive-button" type="button" disabled={saving} onClick={() => void archive(seq)}>Archive</button>}</td>
      </tr>)}</tbody>
    </table></div> : <div className="table-message">No sequences yet. {canWrite ? 'Create one, or start from the 5-email template.' : 'No sequences are available.'}</div>}

    <SlideOut open={createOpen} onClose={() => setCreateOpen(false)} title="New sequence" description="Give the sequence a name. You add steps and a sender next.">
      <form className="slideout-form" onSubmit={create}>
        <label>Name<input value={name} onChange={e => setName(e.target.value)} required maxLength={200} /></label>
        <label>Description<input value={description} onChange={e => setDescription(e.target.value)} maxLength={500} placeholder="Optional" /></label>
        <label>Category<select value={category} onChange={e => setCategory(e.target.value)}><option value="sales">Sales</option><option value="marketing">Marketing</option></select></label>
        <div className="slideout-actions"><button className="secondary-button" type="button" onClick={() => setCreateOpen(false)}>Cancel</button><button className="primary-button" disabled={saving || !orgId || !name.trim()}>{saving ? 'Saving…' : 'Create sequence'}</button></div>
      </form>
    </SlideOut>

    <EntityPage open={!!selected} onClose={closeRecord} kicker="Sequences" title={selected?.name ?? ''}
      sidebar={selected ? <>
        <RailCard title="Summary" rows={[['Status', selected.status], ['Version', `v${selected.current_version}`], ['Sender', senderMailbox?.email_address], ['Daily limit', selected.daily_limit ?? 'No limit'], ['Enrolled', enrollmentSummary.total], ['Replied', enrollmentSummary.replied]]} />
        <section className="rail-card">
          <h2 className="rail-card-title">Preflight</h2>
          <ul className="check-list">{preflight.map(item => <li key={item.label} className={item.ok ? 'check-ok' : 'check-warn'}>
            {item.ok ? <CheckCircle2 size={15} aria-hidden="true" /> : <AlertTriangle size={15} aria-hidden="true" />}
            <div><b>{item.label}</b><span>{item.detail}</span></div>
          </li>)}</ul>
        </section>
      </> : undefined}>
      {selected && <>
        <section className="record-card">
          <div className="record-card-head"><h3>Details</h3></div>
          <form className="form-grid" onSubmit={update}>
            <label className="span-2">Name<input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} required maxLength={200} disabled={!canWrite} /></label>
            <label className="span-2">Description<input value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} maxLength={500} disabled={!canWrite} /></label>
            <label>Status<select value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value })} disabled={!canWrite}><option value="draft">Draft</option><option value="active">Active</option><option value="paused">Paused</option></select></label>
            <label>Daily limit<input inputMode="numeric" value={draft.dailyLimit} onChange={e => setDraft({ ...draft, dailyLimit: e.target.value })} placeholder="No limit" disabled={!canWrite} /></label>
            <label className="span-2">Sender mailbox<select value={draft.senderMailboxId} onChange={e => setDraft({ ...draft, senderMailboxId: e.target.value })} disabled={!canWrite}><option value="">Select a mailbox</option>{mailboxes.map(mb => <option key={mb.id} value={mb.id}>{mb.display_name ? `${mb.display_name} <${mb.email_address}>` : mb.email_address}</option>)}</select></label>
            {canWrite && <div className="form-actions span-2"><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button></div>}
          </form>
        </section>

        <section className="record-card">
          <div className="record-card-head"><h3>Steps</h3><span className="record-card-meta">Version {selected.current_version}</span>{canWrite && selected.status === 'draft' && <button className="secondary-button" type="button" onClick={() => setStepOpen(true)}><Plus size={15} /> Add step</button>}</div>
          {selected.status !== 'draft' && <p className="record-card-note">Pause this sequence and create a new version before changing its steps.</p>}
          {steps.length ? <ol className="step-list">{steps.map((step, index) => <li key={step.id} className="step-row">
            <span className="step-index">{index + 1}</span>
            <div className="step-body">
              <b>{step.kind === 'email' ? 'Send email' : step.kind === 'wait' ? 'Wait' : step.kind === 'task' ? 'Create task' : 'Condition'}</b>
              <span>{step.delay_minutes === 0 ? 'Immediately' : `After ${Math.round(step.delay_minutes / 1440)} day(s)`}{step.business_days_only ? ', business days' : ''} · {step.time_zone_policy} time zone · {templateName(step.template_id)}</span>
            </div>
            {canWrite && selected.status === 'draft' && <button className="icon-only" type="button" aria-label="Delete step" disabled={saving} onClick={() => void removeStep(step)}><Trash2 size={15} /></button>}
          </li>)}</ol> : <p className="record-card-note">No steps have been added to this version.</p>}
          <SlideOut open={stepOpen && canWrite && selected.status === 'draft'} onClose={() => setStepOpen(false)} title="Add step" description="Choose what happens next and when it runs."><div className="slideout-form">
            <label>Kind<select value={stepKind} onChange={e => setStepKind(e.target.value)}><option value="email">Email</option><option value="wait">Wait</option><option value="task">Task</option><option value="condition">Condition</option></select></label>
            <label>Delay (minutes)<input inputMode="numeric" value={stepDelay} onChange={e => setStepDelay(e.target.value)} /></label>
            <label>Template<select value={stepTemplateId} onChange={e => setStepTemplateId(e.target.value)}><option value="">No template</option>{templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
            <label>Time zone<select value={stepTimeZonePolicy} onChange={e => setStepTimeZonePolicy(e.target.value)}><option value="contact">Contact</option><option value="workspace">Workspace</option><option value="utc">UTC</option></select></label>
            <label className="checkbox-label"><input type="checkbox" checked={stepBusinessDays} onChange={e => setStepBusinessDays(e.target.checked)} /> Business days only</label>
            <button className="primary-button" type="button" disabled={saving} onClick={() => void addStep()}>{saving ? 'Adding…' : 'Add step'}</button>
          </div></SlideOut>
        </section>

        <section className="record-card">
          <div className="record-card-head"><h3>Enrollments</h3>{canWrite && selected.status === 'active' && <button className="primary-button" type="button" onClick={() => { setEnrollOpen(true); setEnrollError('') }}><Plus size={15} /> Enroll contact</button>}</div>
          <div className="stat-tiles">
            <div className="stat-tile"><span>Active</span><b>{enrollmentSummary.active}</b></div>
            <div className="stat-tile"><span>Replied</span><b>{enrollmentSummary.replied}</b></div>
            <div className="stat-tile"><span>Paused</span><b>{enrollmentSummary.paused}</b></div>
            <div className="stat-tile"><span>Completed</span><b>{enrollmentSummary.completed}</b></div>
            <div className="stat-tile"><span>Total</span><b>{enrollmentSummary.total}</b></div>
          </div>
          {enrollments.length ? <div className="contact-table-wrap"><table className="contact-table">
            <thead><tr><th>Contact</th><th>State</th><th>Enrolled</th><th>Next run</th><th>Stop reason</th></tr></thead>
            <tbody>{enrollments.map(enrollment => {
              const contact = enrollment.contacts
              const contactName = contact ? `${contact.first_name} ${contact.last_name}`.trim() : 'Unknown'
              return <tr key={enrollment.id}>
                <td><b>{contactName}</b><br /><small>{contact?.email ?? '—'}</small></td>
                <td><span className={stateClass(enrollment.state)}>{enrollment.state.replace('_', ' ')}</span></td>
                <td>{new Date(enrollment.enrolled_at).toLocaleString()}</td>
                <td>{enrollment.next_run_at ? new Date(enrollment.next_run_at).toLocaleString() : '—'}</td>
                <td>{enrollment.stop_reason ?? '—'}</td>
              </tr>
            })}</tbody>
          </table></div> : <p className="record-card-note">No contacts enrolled yet.</p>}
        </section>
      </>}
    </EntityPage>

    <SlideOut open={enrollOpen && canWrite} onClose={() => setEnrollOpen(false)} title="Enroll contact" description="Each person follows their own timeline through this sequence.">
      <div className="slideout-form">
        <label>Contact<select value={enrollContactId} onChange={e => setEnrollContactId(e.target.value)}><option value="">Select a contact</option>{contacts.map(c => <option key={c.id} value={c.id}>{`${c.first_name} ${c.last_name}`.trim()} — {c.email ?? 'no email'}</option>)}</select></label>
        {enrollError && <p className="inline-error" role="alert">{enrollError}</p>}
        <div className="slideout-actions"><button className="secondary-button" type="button" onClick={() => setEnrollOpen(false)}>Cancel</button><button className="primary-button" type="button" disabled={saving || !enrollContactId} onClick={() => void enrollContact()}>{saving ? 'Enrolling…' : 'Enroll'}</button></div>
      </div>
    </SlideOut>
  </section>
}
