import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Plus, Trash2, GripVertical, Mail } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { CenterDialog } from './Overlay'
import Typeahead from './ui/Combo'

import { CITIES, COUNTRIES, LANGUAGES } from '../lib/localeData'

export type SequenceTemplate = {
  id: string
  name: string
  description: string | null
  category: string
  language?: string | null
  city?: string | null
  country?: string | null
  archived_at: string | null
}
export type SequenceTemplateStep = {
  id: string
  template_id: string
  position: number
  kind: string
  subject: string
  html_body: string
  text_body: string
  delay_minutes: number
  delay_unit: string
  business_days_only: boolean
  time_zone_policy: string
}

const defaultDraft = { name: '', description: '', category: 'sales', language: '', city: '', country: '', steps: [] as Array<Partial<SequenceTemplateStep> & { delayDays: string }> }

export function SequenceTemplatesPanel({ userId, canWrite }: { userId: string; canWrite: boolean }) {
  const [orgId, setOrgId] = useState('')
  const [templates, setTemplates] = useState<SequenceTemplate[]>([])
  const [steps, setSteps] = useState<SequenceTemplateStep[]>([])
  const [openId, setOpenId] = useState<string | null>(null)
  const [draft, setDraft] = useState(defaultDraft)
  const [editing, setEditing] = useState<SequenceTemplate | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<SequenceTemplate | null>(null)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [previewIdx, setPreviewIdx] = useState<number | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      const membership = await supabase!.from('memberships').select('organization_id').eq('user_id', userId).limit(1).maybeSingle()
      if (!active) return
      if (membership.error || !membership.data) { setError('Your account is not assigned to a workspace.'); setLoading(false); return }
      const orgIdLocal = membership.data.organization_id
      setOrgId(orgIdLocal)
      const [tplRes, stepRes] = await Promise.all([
        supabase!.from('sequence_templates').select('id,name,description,category,language,city,country,archived_at').eq('organization_id', orgIdLocal).is('archived_at', null).order('name'),
        supabase!.from('sequence_template_steps').select('id,template_id,position,kind,subject,html_body,text_body,delay_minutes,delay_unit,business_days_only,time_zone_policy').in('template_id', (await supabase!.from('sequence_templates').select('id').eq('organization_id', orgIdLocal)).data?.map((t: { id: string }) => t.id) ?? ['00000000-0000-0000-0000-000000000000']).order('position'),
      ])
      if (!active) return
      if (tplRes.error || stepRes.error) setError('Sequence templates could not be loaded.')
      else {
        setTemplates(((tplRes.data ?? []).map(t => ({ ...t, language: t.language ?? null, city: t.city ?? null, country: t.country ?? null }))))
        setSteps((stepRes.data ?? []) as SequenceTemplateStep[])
      }
      setLoading(false)
    })()
    return () => { active = false }
  }, [userId])

  function startCreate() {
    setEditing(null)
    setDraft(defaultDraft)
    setError('')
    setMessage('')
    setOpenId('new')
  }

  function startEdit(template: SequenceTemplate) {
    setEditing(template)
    const tmplSteps = steps.filter(s => s.template_id === template.id).sort((a, b) => a.position - b.position)
    setDraft({ name: template.name, description: template.description ?? '', category: template.category, language: template.language ?? '', city: template.city ?? '', country: template.country ?? '', steps: tmplSteps.map(s => ({ ...s, delayDays: String(Math.round((s.delay_minutes ?? 0) / 1440)) })) })
    setError('')
    setMessage('')
    setOpenId(template.id)
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canWrite || !orgId) return
    if (!draft.name.trim()) { setError('Template name is required.'); return }
    if (draft.steps.length === 0) { setError('Add at least one step.'); return }
    setSaving(true)
    setError('')
    setMessage('')
    try {
      let templateId = editing?.id
      if (!templateId) {
        const inserted = await supabase!.from('sequence_templates').insert({ organization_id: orgId, owner_id: userId, name: draft.name.trim(), description: draft.description.trim() || null, category: draft.category, language: draft.language.trim() || null, city: draft.city.trim() || null, country: draft.country.trim() || null }).select('id').single()
        if (inserted.error) throw inserted.error
        templateId = inserted.data.id as string
      } else {
        const updated = await supabase!.from('sequence_templates').update({ name: draft.name.trim(), description: draft.description.trim() || null, category: draft.category, language: draft.language.trim() || null, city: draft.city.trim() || null, country: draft.country.trim() || null }).eq('id', templateId).eq('organization_id', orgId)
        if (updated.error) throw updated.error
        await supabase!.from('sequence_template_steps').delete().eq('template_id', templateId)
      }
      for (const [index, step] of draft.steps.entries()) {
        const inserted = await supabase!.from('sequence_template_steps').insert({
          template_id: templateId,
          position: index,
          kind: step.kind || 'email',
          subject: step.subject ?? '',
          html_body: step.html_body ?? '',
          text_body: step.text_body ?? '',
          delay_minutes: Math.round(Number(step.delayDays ?? 0) * 1440) || 0,
          delay_unit: 'days',
          business_days_only: !!step.business_days_only,
          time_zone_policy: step.time_zone_policy || 'contact',
          configuration: {},
        })
        if (inserted.error) throw inserted.error
      }
      // reload panel data
      const [tplRes, stepRes] = await Promise.all([
        supabase!.from('sequence_templates').select('id,name,description,category,language,city,country,archived_at').eq('organization_id', orgId).is('archived_at', null).order('name'),
        supabase!.from('sequence_template_steps').select('id,template_id,position,kind,subject,html_body,text_body,delay_minutes,delay_unit,business_days_only,time_zone_policy').in('template_id', (await supabase!.from('sequence_templates').select('id').eq('organization_id', orgId)).data?.map((t: { id: string }) => t.id) ?? ['00000000-0000-0000-0000-000000000000']).order('position'),
      ])
      setTemplates(((tplRes.data ?? []).map(t => ({ ...t, language: t.language ?? null, city: t.city ?? null, country: t.country ?? null }))))
      setSteps((stepRes.data ?? []) as SequenceTemplateStep[])
      setOpenId(null)
      setEditing(null)
      setMessage('Sequence template saved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Template could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  async function archiveOrDelete(template: SequenceTemplate) {
    if (!canWrite || !orgId) return
    const dependent = await supabase!.from('sequences').select('id', { count: 'exact', head: true }).eq('source_template_id', template.id)
    const hasDependents = (dependent.count ?? 0) > 0
    if (hasDependents) {
      const ok = window.confirm(`"${template.name}" has ${dependent.count} sequence(s) created from it. It will be deactivated (archived), not deleted. Continue?`)
      if (!ok) return
      await supabase!.from('sequence_templates').update({ archived_at: new Date().toISOString() }).eq('id', template.id).eq('organization_id', orgId)
    } else {
      const ok = window.confirm(`Delete "${template.name}"? This template has not been used to create any sequence yet.`)
      if (!ok) return
      await supabase!.from('sequence_templates').delete().eq('id', template.id).eq('organization_id', orgId)
      await supabase!.from('sequence_template_steps').delete().eq('template_id', template.id)
    }
    setTemplates(current => current.filter(t => t.id !== template.id))
    setSteps(current => current.filter(s => s.template_id !== template.id))
    setDeleteTarget(null)
    setMessage('Template cancelled.')
  }

  const stepsFor = (templateId: string) => steps.filter(s => s.template_id === templateId).sort((a, b) => a.position - b.position)
  const durationDays = (templateId: string) => {
    const tmplSteps = stepsFor(templateId)
    let totalMinutes = 0
    for (const step of tmplSteps) totalMinutes += Math.max(0, step.delay_minutes ?? 0)
    return Math.ceil(totalMinutes / 1440)
  }

  return <section className="panel sequences-panel">
    <div className="panel-heading">
      <div><h2>Sequence templates</h2><p>Reusable sequence blueprints. Creating a sequence from a template copies every step, day and email.</p></div>
      {canWrite && <button className="primary-button" type="button" disabled={!orgId} onClick={startCreate}><Plus size={15} /> New sequence template</button>}
    </div>
    {error && !editing && <p className="inline-error" role="alert">{error}</p>}
    {message && <p className="success-message" role="status">{message}</p>}

    {loading ? <div className="table-message">Loading sequence templates…</div> : templates.length ? <div className="contact-table-wrap"><table className="contact-table">
      <thead><tr><th>Name</th><th>Steps</th><th>Duration</th><th>Category</th><th aria-label="Actions" /></tr></thead>
      <tbody>{templates.map(template => <tr key={template.id}>
        <td><button className="text-action" type="button" onClick={() => startEdit(template)}>{template.name}</button>{template.description && <><br /><small>{template.description}</small></>}</td>
        <td>{stepsFor(template.id).length}</td>
        <td>{durationDays(template.id)} day(s)</td>
        <td>{template.category}</td>
        <td className="row-actions"><button className="archive-button" type="button" onClick={() => setDeleteTarget(template)}>Cancel</button></td>
      </tr>)}</tbody>
    </table></div> : <div className="table-message">No sequence templates yet. Create one to reuse across B2B outreach.</div>}

    <CenterDialog open={openId !== null} onClose={() => setOpenId(null)} title={editing ? `Edit ${editing.name}` : 'Create sequence template'} description="Define the complete follow-up sequence. Timing between steps is configurable per step.">
      <form className="slideout-form sequencer-template-form" onSubmit={save}>
        <div className="template-grid">
          <label className="span-2">Name<input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} required maxLength={200} placeholder="Standard B2B Outreach" /></label>
          <label className="span-2">Description<input value={draft.description} onChange={e => setDraft({ ...draft, description: e.target.value })} maxLength={500} placeholder="Five follow-ups over 20 days, stop on reply" /></label>
          <label>Category<select value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })}><option value="sales">Sales</option><option value="marketing">Marketing</option></select></label>
          <label><span className="input-label">Language</span><Typeahead value={draft.language} setValue={v => setDraft({ ...draft, language: v })} options={LANGUAGES} placeholder="en" /></label>
          <label><span className="input-label">City</span><Typeahead value={draft.city} setValue={v => setDraft({ ...draft, city: v })} options={CITIES} placeholder="Austin" /></label>
          <label><span className="input-label">Country</span><Typeahead value={draft.country} setValue={v => setDraft({ ...draft, country: v })} options={COUNTRIES} placeholder="United States" /></label>
        </div>

        <h3 className="builder-title">Steps</h3>
        <ol className="template-steps">
          {draft.steps.map((step, index) => <li key={index} className="template-step">
            <GripVertical size={15} aria-hidden="true" />
            <div className="template-step-head"><b>Step {index + 1}</b><small>{index === 0 ? 'Day 1' : `After ${step.delayDays ?? '0'} day(s)`}</small></div>
            <div className="template-step-fields">
              <label>Subject<input value={step.subject ?? ''} onChange={e => setDraft(current => ({ ...current, steps: current.steps.map((s, i) => i === index ? { ...s, subject: e.target.value } : s) }))} placeholder="A possible opportunity for {{company}}" /></label>
              <label>HTML body<textarea rows={4} value={step.html_body ?? ''} onChange={e => setDraft(current => ({ ...current, steps: current.steps.map((s, i) => i === index ? { ...s, html_body: e.target.value } : s) }))} placeholder="<p>Hi {{first_name}},</p>" /></label>
              <label>Text body<textarea rows={3} value={step.text_body ?? ''} onChange={e => setDraft(current => ({ ...current, steps: current.steps.map((s, i) => i === index ? { ...s, text_body: e.target.value } : s) }))} placeholder="Hi {{first_name}}," /></label>
              <div className="template-step-meta">
                <label>Wait (days)<input inputMode="numeric" value={step.delayDays ?? '0'} onChange={e => setDraft(current => ({ ...current, steps: current.steps.map((s, i) => i === index ? { ...s, delayDays: e.target.value } : s) }))} /></label>
                <label className="checkbox-label"><input type="checkbox" checked={!!step.business_days_only} onChange={e => setDraft(current => ({ ...current, steps: current.steps.map((s, i) => i === index ? { ...s, business_days_only: e.target.checked } : s) }))} /> Business days</label>
                <button className="secondary-button" type="button" onClick={() => setPreviewIdx(index)}><Mail size={13} /> Preview</button>
                <button className="icon-only" type="button" aria-label="Remove step" onClick={() => setDraft(current => ({ ...current, steps: current.steps.filter((_, i) => i !== index) }))}><Trash2 size={15} /></button>
              </div>
            </div>
          </li>)}
        </ol>
        <div className="slideout-actions">
          <button className="secondary-button" type="button" onClick={() => setDraft(current => ({ ...current, steps: [...current.steps, { kind: 'email', subject: '', html_body: '', text_body: '', delayDays: '3', business_days_only: true, time_zone_policy: 'contact' }] }))}><Plus size={15} /> Add step</button>
        </div>
        {error && <p className="inline-error">{error}</p>}
        <div className="slideout-actions">
          <button className="secondary-button" type="button" onClick={() => setOpenId(null)}>Cancel</button>
          <button className="primary-button" disabled={saving || !orgId}>{saving ? 'Saving…' : 'Save as template'}</button>
        </div>
      </form>
    </CenterDialog>

    <CenterDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Cancel this template?" description="Deactivating a template prevents its use for new sequences. Existing sequences and their history are preserved.">
      <p>Template: <b>{deleteTarget?.name}</b>. This action archives it; it does not delete any sequence already created.</p>
      <div className="slideout-actions">
        <button className="secondary-button" type="button" onClick={() => setDeleteTarget(null)}>Keep</button>
        <button className="primary-button" type="button" onClick={() => deleteTarget && void archiveOrDelete(deleteTarget)}>Cancel template</button>
      </div>
    </CenterDialog>

    <CenterDialog open={previewIdx !== null && draft.steps[previewIdx] !== undefined} onClose={() => setPreviewIdx(null)} title="Step preview" description="Rendered preview with sample merge values.">
      {previewIdx !== null && <div className="template-preview"><h4>{draft.steps[previewIdx]?.subject || 'Untitled step'}</h4><pre className="template-preview-text">{(draft.steps[previewIdx]?.text_body ?? '').replace('{{first_name}}', 'Sarah').replace('{{company}}', 'ABC Group').replace('{{unsubscribe_link}}', 'https://example.com/unsubscribe')}</pre>{draft.steps[previewIdx]?.html_body ? <iframe className="message-html-body" title="Step preview" sandbox="" referrerPolicy="no-referrer" srcDoc={draft.steps[previewIdx]?.html_body} /> : null}</div>}
    </CenterDialog>
  </section>
}
