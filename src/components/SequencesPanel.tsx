import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'

type Sequence = { id: string; name: string; description: string | null; status: string; category: string; current_version: number; daily_limit: number | null; archived_at: string | null }
type Step = { id: string; position: number; kind: string; delay_minutes: number; business_days_only: boolean; time_zone_policy: string; template_id: string | null }
type Enrollment = { id: string; contact_id: string; state: string; enrolled_at: string; next_step_position: number; next_run_at: string | null; stopped_at: string | null; stop_reason: string | null; contacts: { first_name: string; last_name: string; email: string | null } | null }

export function SequencesPanel({ userId, canWrite }: { userId: string; canWrite: boolean }) {
  const [orgId, setOrgId] = useState('')
  const [sequences, setSequences] = useState<Sequence[]>([])
  const [templates, setTemplates] = useState<{ id: string; name: string }[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [steps, setSteps] = useState<Step[]>([])
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('sales')
  const [draft, setDraft] = useState({ name: '', description: '', status: 'draft', dailyLimit: '' })
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
      setOrgId(membership.data.organization_id)
      const [seqRes, tplRes] = await Promise.all([
        supabase!.from('sequences').select('id,name,description,status,category,current_version,daily_limit,archived_at').eq('organization_id', membership.data.organization_id).is('archived_at', null).order('name'),
        supabase!.from('email_templates').select('id,name').eq('organization_id', membership.data.organization_id).is('archived_at', null).order('name'),
      ])
      if (!active) return
      if (seqRes.error || tplRes.error) setError('Sequences or templates could not be loaded.')
      else { setSequences(seqRes.data ?? []); setTemplates(tplRes.data ?? []) }
      setLoading(false)
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
      setSaving(false)
      return
    }
    setSequences(current => [...current, sequenceResult.data as Sequence].sort((a, b) => a.name.localeCompare(b.name)))
    setName(''); setDescription(''); setCategory('sales')
    setSaving(false)
  }

  function select(seq: Sequence) {
    setSelectedId(seq.id)
    setDraft({ name: seq.name, description: seq.description ?? '', status: seq.status, dailyLimit: seq.daily_limit?.toString() ?? '' })
  }

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
    const result = await supabase!.from('sequences').update({ name: draft.name.trim(), description: draft.description.trim() || null, status: draft.status, daily_limit: dailyLimit }).eq('id', selected.id).eq('organization_id', orgId).select('id,name,description,status,category,current_version,daily_limit,archived_at').single()
    if (result.error) {
      const message = result.error.message
      setError(message.includes('at least one step') ? 'Add at least one step before activating this sequence.' : message.includes('requires a template') ? 'Every email step needs a template before activation.' : 'Sequence changes could not be saved.')
    } else { setSequences(current => current.map(s => s.id === selected.id ? result.data as Sequence : s).sort((a, b) => a.name.localeCompare(b.name))); setSelectedId(result.data.id) }
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

  async function addStep() {
    if (!canWrite || !selected || selected.status !== 'draft') return
    const position = steps.length
    setSaving(true)
    setError('')
    const result = await supabase!.from('sequence_steps').insert({ sequence_id: selected.id, version: selected.current_version, position, kind: stepKind, delay_minutes: Number(stepDelay) || 0, business_days_only: stepBusinessDays, time_zone_policy: stepTimeZonePolicy, template_id: stepTemplateId || null, configuration: {} }).select('id,position,kind,delay_minutes,business_days_only,time_zone_policy,template_id').single()
    if (result.error) setError('Step could not be added.')
    else setSteps(current => [...current, result.data as Step].sort((a, b) => a.position - b.position))
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

  function statusClass(state: string) {
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
    stopped: enrollments.filter(e => e.stopped_at).length,
  }

  return <section className="panel contacts-panel">
    <div className="panel-heading"><div><h2>Sequences</h2><p>Multi-step sales follow-up. Sending is not enabled yet.</p></div></div>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {canWrite && <form className="contact-form" onSubmit={create}>
      <label>Name<input value={name} onChange={e => setName(e.target.value)} required maxLength={200} /></label>
      <label>Description<input value={description} onChange={e => setDescription(e.target.value)} maxLength={500} placeholder="Optional" /></label>
      <label>Category<select value={category} onChange={e => setCategory(e.target.value)}><option value="sales">sales</option><option value="marketing">marketing</option></select></label>
      <button className="primary-button" disabled={saving || !orgId}>{saving ? 'Saving...' : 'Create sequence'}</button>
    </form>}
    {loading ? <div className="table-message">Loading sequences...</div> : sequences.length ? <div className="contact-table-wrap"><table className="contact-table"><thead><tr><th>Name</th><th>Status</th><th>Version</th><th>Action</th></tr></thead><tbody>{sequences.map(seq => <tr key={seq.id}><td><button className="text-action" onClick={() => select(seq)}>{seq.name}</button></td><td>{seq.status}</td><td>v{seq.current_version}</td><td>{canWrite && <button className="archive-button" type="button" onClick={() => void archive(seq)}>Archive</button>}</td></tr>)}</tbody></table></div> : !error && <div className="table-message">No sequences yet. {canWrite ? 'Create one above.' : 'No sequences are available.'}</div>}
    {selected && <section className="contact-editor" aria-label="Sequence details">
      <div className="editor-heading"><div><h3>{selected.name}</h3><p>Sequence v{selected.current_version} · {selected.status}</p></div><button className="secondary-button" type="button" onClick={() => setSelectedId('')}>Close</button></div>
      {canWrite ? <form className="contact-form" onSubmit={update}>
        <label>Name<input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} required maxLength={200} /></label>
        <label>Description<input value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} maxLength={500} /></label>
        <label>Status<select value={draft.status} onChange={e => setDraft({ ...draft, status: e.target.value })}><option value="draft">draft</option><option value="active">active</option><option value="paused">paused</option></select></label>
        <label>Daily limit<input inputMode="numeric" value={draft.dailyLimit} onChange={e => setDraft({ ...draft, dailyLimit: e.target.value })} placeholder="Optional" /></label>
        <button className="primary-button" disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</button>
      </form> : <dl className="contact-readonly"><dt>Status</dt><dd>{selected.status}</dd><dt>Category</dt><dd>{selected.category}</dd></dl>}
      <div className="activity-timeline"><h4>Steps (v{selected.current_version})</h4>
        {canWrite && selected.status === 'draft' && <div className="contact-form"><label>Kind<select value={stepKind} onChange={e => setStepKind(e.target.value)}><option value="email">email</option><option value="wait">wait</option><option value="task">task</option><option value="condition">condition</option></select></label><label>Delay (minutes)<input inputMode="numeric" value={stepDelay} onChange={e => setStepDelay(e.target.value)} /></label><label>Business days only<input type="checkbox" checked={stepBusinessDays} onChange={e => setStepBusinessDays(e.target.checked)} /></label><label>Time zone<select value={stepTimeZonePolicy} onChange={e => setStepTimeZonePolicy(e.target.value)}><option value="contact">contact</option><option value="workspace">workspace</option><option value="utc">utc</option></select></label><label>Template<select value={stepTemplateId} onChange={e => setStepTemplateId(e.target.value)}><option value="">No template</option>{templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label><button className="primary-button" type="button" disabled={saving} onClick={() => void addStep()}>{saving ? 'Adding...' : 'Add step'}</button></div>}
        {selected.status !== 'draft' && <p>Pause this sequence and create a new version before changing its steps.</p>}
        {steps.length ? <ol>{steps.map(step => <li key={step.id}><div><b>{step.kind}</b> · delay {step.delay_minutes} min {step.business_days_only ? '· business days' : ''} · {step.time_zone_policy} {step.template_id ? `· template ${templates.find(t => t.id === step.template_id)?.name ?? step.template_id}` : ''}</div>{canWrite && selected.status === 'draft' && <button className="text-action" type="button" onClick={() => void removeStep(step)}>Delete</button>}</li>)}</ol> : <p>No steps have been added to this version.</p>}
      </div>
      <div className="activity-timeline"><h4>Enrollments</h4>
        <div className="enrollment-summary">
          <span className="status-chip status-chip-active">Active: {enrollmentSummary.active}</span>
          <span className="status-chip status-chip-replied">Replied: {enrollmentSummary.replied}</span>
          <span className="status-chip status-chip-paused">Paused: {enrollmentSummary.paused}</span>
          <span className="status-chip status-chip-completed">Completed: {enrollmentSummary.completed}</span>
          <span className="status-chip">Total: {enrollmentSummary.total}</span>
        </div>
        {enrollments.length ? <div className="contact-table-wrap"><table className="contact-table"><thead><tr><th>Contact</th><th>State</th><th>Enrolled</th><th>Next run</th><th>Stop reason</th></tr></thead><tbody>{enrollments.map(enrollment => {
          const contact = enrollment.contacts
          const contactName = contact ? `${contact.first_name} ${contact.last_name}`.trim() : 'Unknown'
          const nextRun = enrollment.next_run_at ? new Date(enrollment.next_run_at).toLocaleString() : '—'
          const enrolledAt = new Date(enrollment.enrolled_at).toLocaleString()
          return <tr key={enrollment.id}><td><b>{contactName}</b><br/><small>{contact?.email ?? '—'}</small></td><td><span className={statusClass(enrollment.state)}>{enrollment.state.replace('_', ' ')}</span></td><td>{enrolledAt}</td><td>{nextRun}</td><td>{enrollment.stop_reason ?? '—'}</td></tr>
        })}</tbody></table></div> : <p>No contacts enrolled yet.</p>}
      </div>
    </section>}
  </section>
}
