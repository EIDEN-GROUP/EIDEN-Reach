import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { AlertTriangle, CheckCircle2, Mail, Plus, Trash2, Pause, Play, XCircle, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { sendSequenceStep, dispatchDue } from '../lib/mailbox-api'
import { calculateSequenceKpis, formatKpi, type SequenceKpis } from '../lib/dashboard-metrics'
import { EntityPage, RailCard, SlideOut, CenterDialog } from './Overlay'
import Typeahead from './DataList'

import { CITIES, COUNTRIES, LANGUAGES } from '../lib/localeData'
import type { SequenceTemplateListItem } from './sequenceTemplateTypes'

export type { SequenceTemplateListItem }

type Sequence = { id: string; name: string; description: string | null; status: string; category: string; industry?: string | null; current_version: number; daily_limit: number | null; archived_at: string | null; sender_mailbox_id: string | null; source_template_id?: string | null; language?: string | null; city?: string | null; country?: string | null }

type Step = { id: string; position: number; kind: string; delay_minutes: number; business_days_only: boolean; time_zone_policy: string; template_id: string | null }
type Enrollment = { id: string; contact_id: string; state: string; enrolled_at: string; next_step_position: number; next_run_at: string | null; stopped_at: string | null; stop_reason: string | null; contacts: { first_name: string; last_name: string; email: string | null } | null }
type Mailbox = { id: string; email_address: string; display_name: string | null }
type Contact = { id: string; first_name: string; last_name: string; email: string | null; job_title: string | null; lifecycle: string; company_id: string | null; companies?: { name: string | null } | null }
type TemplateInfo = { id: string; name: string; subject: string; html_body: string; text_body: string }

const SEQUENCE_COLUMNS = 'id,name,description,status,category,current_version,daily_limit,archived_at,sender_mailbox_id,source_template_id,industry'

export function SequencesPanel({ userId, canWrite }: { userId: string; canWrite: boolean }) {
  const [orgId, setOrgId] = useState('')
  const [sequences, setSequences] = useState<Sequence[]>([])
  const [templates, setTemplates] = useState<TemplateInfo[]>([])
  const [sequenceTemplates, setSequenceTemplates] = useState<SequenceTemplateListItem[]>([])
  const [industries, setIndustries] = useState<string[]>([])
  const [selectedId, setSelectedId] = useState('')
  const [steps, setSteps] = useState<Step[]>([])
  const [enrollments, setEnrollments] = useState<Enrollment[]>([])
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([])
  const [contacts, setContacts] = useState<Contact[]>([])
  const [kpis, setKpis] = useState<SequenceKpis | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [category] = useState('sales')
  const [industry, setIndustry] = useState('')
  const [language, setLanguage] = useState('')
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('')
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [draft, setDraft] = useState({ name: '', description: '', status: 'draft', dailyLimit: '', senderMailboxId: '', industry: '', language: '', city: '', country: '' })
  const [templateLoading, setTemplateLoading] = useState(false)
  const [enrollOpen, setEnrollOpen] = useState(false)
  const [enrollSearch, setEnrollSearch] = useState('')
  const [enrollSelected, setEnrollSelected] = useState<Record<string, boolean>>({})
  const [enrollCompany, setEnrollCompany] = useState('')
  const [enrollLifecycle, setEnrollLifecycle] = useState('')
  const [enrollError, setEnrollError] = useState('')
  const [enrollInfo, setEnrollInfo] = useState('')
  const [stepOpen, setStepOpen] = useState(false)
  const [stepKind, setStepKind] = useState('email')
  const [stepDelay, setStepDelay] = useState('0')
  const [stepBusinessDays, setStepBusinessDays] = useState(false)
  const [stepTimeZonePolicy, setStepTimeZonePolicy] = useState('contact')
  const [stepTemplateId, setStepTemplateId] = useState('')
  const [previewStepId, setPreviewStepId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [sendNotice, setSendNotice] = useState('')
  const [dispatchNotice, setDispatchNotice] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void (async () => {
      const membership = await supabase!.from('memberships').select('organization_id').eq('user_id', userId).limit(1).maybeSingle()
      if (!active) return
      if (membership.error || !membership.data) { setError('Your account is not assigned to a workspace.'); setLoading(false); return }
      const organizationId = membership.data.organization_id
      setOrgId(organizationId)
      void (async () => { const iRes = await supabase!.from('industry_categories').select('name').eq('organization_id', organizationId).is('archived_at', null).order('name'); if (!iRes.error && iRes.data) setIndustries(iRes.data.map((r: { name: string }) => r.name)) })()
      const [seqRes, tplRes, seqTplRes] = await Promise.all([
        supabase!.from('sequences').select(SEQUENCE_COLUMNS).eq('organization_id', organizationId).is('archived_at', null).order('name'),
        supabase!.from('email_templates').select('id,name,subject,html_body,text_body').eq('organization_id', organizationId).is('archived_at', null).order('name'),
        supabase!.from('sequence_templates').select('id,name,description,archived_at').eq('organization_id', organizationId).is('archived_at', null).order('name'),
      ])
      if (!active) return
      if (seqRes.error || tplRes.error) setError('Sequences or templates could not be loaded.')
      else {
        setSequences((seqRes.data ?? []) as Sequence[])
        setTemplates((tplRes.data ?? []) as TemplateInfo[])
        setSequenceTemplates(((seqTplRes.data ?? []) as SequenceTemplateListItem[]).map(t => ({ id: t.id, name: t.name, description: t.description, archived_at: t.archived_at ?? null })))
      }
      setLoading(false)

      const [mailboxRes, contactRes] = await Promise.all([
        supabase!.from('mailbox_accounts').select('id,email_address,display_name').eq('organization_id', organizationId).is('disconnected_at', null).order('created_at'),
        supabase!.from('contacts').select('id,first_name,last_name,email,job_title,lifecycle,company_id,companies:company_id(name)').eq('organization_id', organizationId).is('archived_at', null).limit(500).order('first_name'),
      ])
      if (!active) return
      if (mailboxRes.error) setError('Mailboxes could not be loaded.')
      else setMailboxes(mailboxRes.data ?? [])
      if (contactRes.error) setError('Contacts could not be loaded.')
      else setContacts((contactRes.data ?? []) as unknown as Contact[])
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
    if (!selectedId) { setEnrollments([]); setKpis(null); return }
    let active = true
    void (async () => {
      const result = await supabase!.from('sequence_enrollments')
        .select('id,contact_id,state,enrolled_at,next_step_position,next_run_at,stopped_at,stop_reason,contacts:contact_id(first_name,last_name,email)')
        .eq('sequence_id', selectedId)
        .order('enrolled_at', { ascending: false })
        .limit(500)
      if (!active) return
      if (result.error) { setError('Enrollments could not be loaded.'); return }
      const rows = (result.data ?? []) as unknown as Enrollment[]
      setEnrollments(rows)
    })()
    return () => { active = false }
  }, [selectedId])

  // Sequence KPI summary (real data: enrollments + activity events + step states)
  useEffect(() => {
    let active = true
    void (async () => {
      if (!orgId) return
      const mySequences = sequences.map(s => s.id)
      if (mySequences.length === 0) { setKpis(emptyKpis()); return }
      const [enrRes, stepRes, actRes] = await Promise.all([
        supabase!.from('sequence_enrollments').select('state,stop_reason,next_step_position').in('sequence_id', mySequences),
        supabase!.from('sequence_steps').select('id').in('sequence_id', mySequences),
        supabase!.from('activity_events').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).ilike('event_type', '%sent%'),
      ])
      if (!active) return
      const stepIds = (stepRes.data ?? []).map(s => (s as { id: string }).id)
      let stepStates: Array<{ state: string }> = []
      if (stepIds.length) {
        const ss = await supabase!.from('enrollment_step_states').select('state').in('sequence_step_id', stepIds).limit(1000)
        stepStates = (ss.data ?? []) as Array<{ state: string }>
      }
      const enrollmentsData = (enrRes.data ?? []) as Array<{ state: string; stop_reason?: string | null; next_step_position?: number }>
      setKpis(calculateSequenceKpis({ enrollments: enrollmentsData, stepStates, sentCount: actRes.count ?? 0 }))
    })()
    return () => { active = false }
  }, [orgId, sequences])

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
      target_category: 'sales',
    }).single()
    if (sequenceResult.error) {
      setError(sequenceResult.error.code === '23505' ? 'A sequence with that name already exists.' : 'Sequence could not be initialized.')
      setSaving(false)
      return
    } else {
      const restaurantId = (sequenceResult.data as { id: string }).id
      await supabase!.from('sequences').update({ industry: industry.trim() || null, language: language.trim() || null, city: city.trim() || null, country: country.trim() || null }).eq('id', restaurantId)
    }
    const createdId = (sequenceResult.data as { id: string }).id
    // If a sequence template was selected, copy its steps now
    if (selectedTemplateId) {
      try {
        const tplSteps = await supabase!.from('sequence_template_steps').select('id,position,subject,html_body,text_body,kind,delay_minutes,business_days_only,time_zone_policy').eq('template_id', selectedTemplateId).order('position')
        if (tplSteps.error) throw tplSteps.error
        for (const step of tplSteps.data ?? []) {
          // create a template per email step so sequence_steps stays consistent with the engine's template reference
          const templateInsert = await supabase!.from('email_templates').insert({
            organization_id: orgId,
            owner_id: userId,
            name: `${name.trim()}: step ${step.position + 1}`,
            subject: step.subject ?? '',
            html_body: step.html_body ?? '',
            text_body: step.text_body ?? '',
            category: category,
          }).select('id').single()
          if (templateInsert.error) throw templateInsert.error
          const stepRes = await supabase!.from('sequence_steps').insert({
            sequence_id: createdId,
            version: 1,
            position: step.position,
            kind: step.kind ?? 'email',
            delay_minutes: step.delay_minutes ?? 0,
            business_days_only: step.business_days_only ?? true,
            time_zone_policy: step.time_zone_policy ?? 'contact',
            template_id: step.kind === 'email' ? templateInsert.data.id : null,
            configuration: {},
          })
          if (stepRes.error) throw stepRes.error
        }
        await supabase!.from('sequences').update({ source_template_id: selectedTemplateId, source_template_version: new Date().toISOString() }).eq('id', createdId)
      } catch (copyError) {
        console.error('copy template steps failed', copyError)
        setError('Sequence was created, but copying template steps failed. Add steps manually.')
      }
    }
    const fetched = await supabase!.from('sequences').select(SEQUENCE_COLUMNS).eq('id', createdId).maybeSingle()
    if (fetched.data) {
      setSequences(current => [...current, fetched.data as Sequence].sort((a, b) => a.name.localeCompare(b.name)))
      select(fetched.data as Sequence)
    }
    setName(''); setDescription(''); setIndustry(''); setLanguage(''); setCity(''); setCountry(''); setSelectedTemplateId('')
    setCreateOpen(false)
    setSaving(false)
  }

  function select(seq: Sequence) {
    setSelectedId(seq.id)
    setDraft({ name: seq.name, description: seq.description ?? '', status: seq.status, dailyLimit: seq.daily_limit?.toString() ?? '', senderMailboxId: seq.sender_mailbox_id ?? '', industry: seq.industry ?? '', language: seq.language ?? '', city: seq.city ?? '', country: seq.country ?? '' })
    setSendNotice('')
  }

  function closeRecord() { setSelectedId('') }

  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canWrite || !selected) return
    setSaving(true)
    setError('')
    const dailyLimit = draft.dailyLimit ? Number(draft.dailyLimit) : null
    const industryValue = draft.industry.trim() || ''
    if (dailyLimit !== null && (!Number.isInteger(dailyLimit) || dailyLimit <= 0)) {
      setError('Daily limit must be a positive whole number.')
      setSaving(false)
      return
    }
    const result = await supabase!.from('sequences').update({ name: draft.name.trim(), description: draft.description.trim() || null, status: draft.status, daily_limit: dailyLimit, industry: industryValue, sender_mailbox_id: draft.senderMailboxId || null, language: draft.language.trim() || null, city: draft.city.trim() || null, country: draft.country.trim() || null }).eq('id', selected.id).eq('organization_id', orgId).select(SEQUENCE_COLUMNS).single()
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
          const inserted = await supabase!.from('email_templates').insert({ organization_id: orgId, owner_id: userId, name: spec.template, subject: spec.subject, html_body: `<p>Hi {{first_name}},</p><p>This is a personal follow-up for <strong>{{company}}</strong>.</p><p>Best regards,<br>{{sender_name}}</p><p style="font-size:12px;color:#6b7280">You are receiving this email because you were identified as a business fit. <a href="{{unsubscribe_link}}">Unsubscribe</a></p>`, text_body: `Hi {{first_name}},\n\nThis is a personal follow-up for your company {{company}}.\n\nBest regards,\n{{sender_name}}\n\nUnsubscribe: {{unsubscribe_link}}`, category: 'sales' }).select('id').single()
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

  async function enrollContact(enrollment_id: string) {
    if (!canWrite || !selected || !orgId) return
    setSaving(true)
    setEnrollError('')
    const ins = await supabase!.from('sequence_enrollments').insert({
      organization_id: orgId,
      sequence_id: selected.id,
      sequence_version: selected.current_version,
      contact_id: enrollment_id,
      owner_id: userId,
      state: 'active',
      enrolled_at: new Date().toISOString(),
      next_step_position: 0,
      next_run_at: new Date().toISOString(),
      created_by: userId,
    }).select('id,contact_id,state,enrolled_at,next_step_position,next_run_at,stopped_at,stop_reason,contacts:contact_id(first_name,last_name,email)').single()
    if (ins.error) {
      if (ins.error.message.includes('duplicate') || ins.error.message.includes('violation')) setEnrollError('Already live in this sequence.')
      else setEnrollError(ins.error.message)
    } else {
      setEnrollments(current => [ins.data as unknown as Enrollment, ...current])
    }
    setSaving(false)
    return !ins.error
  }

  async function bulkEnroll() {
    if (!canWrite || !selected || !orgId) return
    const selectedIds = Object.keys(enrollSelected).filter(id => enrollSelected[id])
    if (selectedIds.length === 0) { setEnrollError('Select at least one contact.'); return }
    setSaving(true)
    setEnrollError('')
    setEnrollInfo('')
    let added = 0
    let failed = 0
    for (const contactId of selectedIds) {
      const ok = await enrollContact(contactId)
      if (ok) added += 1; else failed += 1
    }
    setEnrollInfo(`Enrolled ${added}${failed ? ` Â· ${failed} already enrolled or failed` : ''}`)
    setEnrollSelected({})
    setSaving(false)
  }

  async function enrollmentAction(enrollment: Enrollment, action: 'pause' | 'resume' | 'stop') {
    if (!canWrite) return
    const update: Record<string, unknown> = action === 'pause'
      ? { state: 'paused' }
      : action === 'resume'
        ? { state: 'active' }
        : { state: 'cancelled', stopped_at: new Date().toISOString(), stop_reason: 'manual_stop', next_run_at: null }
    const result = await supabase!.from('sequence_enrollments').update(update).eq('id', enrollment.id)
    if (result.error) { setError('Enrollment could not be updated.'); return }
    if (action === 'stop') {
      const contactName = (enrollment.contacts ? `${enrollment.contacts.first_name} ${enrollment.contacts.last_name}` : 'contact').trim()
      await supabase!.from('activity_events').insert({ organization_id: orgId, contact_id: enrollment.contact_id, event_type: 'sequence_stop', summary: `Sequence stopped manually for ${contactName}`, source: 'sequences.panel' })
    }
    setEnrollments(current => current.map(row => row.id === enrollment.id ? { ...row, ...(action === 'pause' ? { state: 'paused' } : action === 'resume' ? { state: 'active' } : { state: 'cancelled', stopped_at: new Date().toISOString(), stop_reason: 'manual_stop', next_run_at: null }) } : row))
  }

  async function sendNow(enrollment: Enrollment) {
    if (!canWrite || !orgId) return
    setSendNotice('')
    setSaving(true)
    try {
      const res = await sendSequenceStep(orgId, enrollment.id)
      setSendNotice(`Sent to ${res.contactEmail}. Unsubscribe URL: ${res.unsubscribeUrl}`)
    } catch (sendError) {
      setSendNotice(sendError instanceof Error ? sendError.message : 'Send failed.')
    } finally {
      setSaving(false)
    }
  }

  async function dispatchNow() {
    if (!canWrite || !orgId) return
    setDispatchNotice('Dispatching\u2026')
    try {
      const res = await dispatchDue(orgId, 5)
      if (selectedId) {
        const r = await supabase!.from('sequence_enrollments').select('id,contact_id,state,enrolled_at,next_step_position,next_run_at,stopped_at,stop_reason,contacts:contact_id(first_name,last_name,email)').eq('sequence_id', selectedId).order('enrolled_at', { ascending: false }).limit(500)
        if (!r.error && r.data) setEnrollments((r.data as unknown as Enrollment[]))
      }
      setDispatchNotice(`Dispatched ${res.claimed} due \u00b7 ${res.succeeded} sent \u00b7 ${res.retried} skipped \u00b7 ${res.failed} failed`)
    } catch (err) {
      setDispatchNotice(err instanceof Error ? err.message : 'Dispatch failed.')
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
      case 'cancelled': return 'status-chip status-chip-bounced'
      default: return 'status-chip'
    }
  }

  const enrollmentSummary = {
    total: enrollments.length,
    active: enrollments.filter(e => ['pending', 'active', 'waiting', 'sending'].includes(e.state)).length,
    replied: enrollments.filter(e => e.state === 'replied').length,
    paused: enrollments.filter(e => e.state === 'paused').length,
    completed: enrollments.filter(e => e.state === 'completed').length,
    bounced: enrollments.filter(e => e.state === 'bounced' || e.stop_reason === 'hard_bounce').length,
  }

  const enrolledContactIds = useMemo(() => new Set(enrollments.map(e => e.contact_id)), [enrollments])
  const filteredContacts = useMemo(() => {
    const term = enrollSearch.trim().toLowerCase()
    return contacts.filter(c => {
      if (enrollLifecycle && c.lifecycle !== enrollLifecycle) return false
      const companyName = c.companies?.name ?? ''
      if (enrollCompany && !companyName.toLowerCase().includes(enrollCompany.toLowerCase())) return false
      if (!term) return true
      const haystack = `${c.first_name} ${c.last_name} ${c.email ?? ''} ${c.job_title ?? ''} ${companyName} ${c.lifecycle}`.toLowerCase()
      return haystack.includes(term)
    })
  }, [contacts, enrollSearch, enrollLifecycle, enrollCompany])
  const selectableFiltered = filteredContacts.filter(c => !enrolledContactIds.has(c.id))
  const allPageSelected = selectableFiltered.length > 0 && selectableFiltered.every(c => enrollSelected[c.id])
  const enrollCompanies = useMemo(() => Array.from(new Set(contacts.map(c => c.companies?.name).filter((v): v is string => !!v))).sort(), [contacts])
  const enrollLifecycles = useMemo(() => Array.from(new Set(contacts.map(c => c.lifecycle).filter(Boolean))).sort(), [contacts])

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
  const templateInfo = (id: string | null) => id ? templates.find(t => t.id === id) : undefined
  const previewTemplate = previewStepId ? templateInfo(steps.find(s => s.id === previewStepId)?.template_id ?? null) : undefined

  return <section className="panel sequences-panel">
    <div className="panel-heading">
      <div><h2>Sequences</h2><p>Multi-step follow-up that stops automatically when a contact replies.</p></div>
      {canWrite && <div className="panel-actions">
        <button className="secondary-button" type="button" disabled={saving || templateLoading || !orgId} onClick={() => void useStandardTemplate()}>{templateLoading ? 'Creatingâ€¦' : 'Use 5-email template'}</button>
        <button className="primary-button" type="button" disabled={!orgId} onClick={() => setCreateOpen(true)}><Plus size={15} /> New sequence</button>
        {canWrite && <button className="secondary-button" type="button" disabled={saving || !orgId} onClick={() => void dispatchNow()} title="Process all due enrollments now.">Dispatch due emails</button>}
      </div>}
    </div>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {kpis && <div className="stat-tiles" style={{ marginBottom: 12 }}>
      <div className="stat-tile"><span>Sequences</span><b>{sequences.length}</b></div>
      <div className="stat-tile"><span>Active</span><b>{sequences.filter(s => s.status === 'active').length}</b></div>
      <div className="stat-tile"><span>Paused</span><b>{sequences.filter(s => s.status === 'paused').length}</b></div>
      <div className="stat-tile"><span>Enrolled</span><b>{formatKpi(kpis.enrolled)}</b></div>
      <div className="stat-tile"><span>Emails sent</span><b>{formatKpi(kpis.emailsSent)}</b></div>
      <div className="stat-tile"><span>Reply rate</span><b>{formatKpi(kpis.replyRate, '%')}</b></div>
      <div className="stat-tile"><span>Bounce rate</span><b>{formatKpi(kpis.bounceRate, '%')}</b></div>
      <div className="stat-tile"><span>Unsubscribed</span><b>{formatKpi(kpis.unsubscribed)}</b></div>
            <div className="stat-tile"><span>Replied</span><b>{kpis ? formatKpi(kpis.replied) : "—"}</b></div>
    </div>}

    {loading ? <div className="table-message">Loading sequences...</div> : sequences.length ? <div className="contact-table-wrap"><table className="contact-table">
      <thead><tr><th>Name</th><th>Status</th><th>Version</th><th aria-label="Actions" /></tr></thead>
      <tbody>{sequences.map(seq => <tr key={seq.id}>
        <td><button className="text-action" type="button" onClick={() => select(seq)}>{seq.name}</button></td>
        <td><span className={stateClass(seq.status === 'active' ? 'active' : seq.status === 'paused' ? 'paused' : 'pending')}>{seq.status}</span></td>
        <td>v{seq.current_version}</td>
        <td className="row-actions">{canWrite && <button className="archive-button" type="button" disabled={saving} onClick={() => void archive(seq)}>Cancel</button>}</td>
      </tr>)}</tbody>
    </table></div> : <div className="table-message">No sequences yet. {canWrite ? 'Create one, or start from the 5-email template.' : 'No sequences are available.'}</div>}

    <SlideOut open={createOpen} onClose={() => setCreateOpen(false)} title="New sequence" description="Give the sequence a name, or start from a sequence template â€” the steps are copied automatically.">
      <form className="slideout-form" onSubmit={create}>
        <label>Name<input value={name} onChange={e => setName(e.target.value)} required maxLength={200} /></label>
        <label>Description<input value={description} onChange={e => setDescription(e.target.value)} maxLength={500} placeholder="Optional" /></label>
        <label>Industry<select value={industry} onChange={e => setIndustry(e.target.value)}><option value="">No industry</option>{industries.map(ic => (<option key={ic} value={ic}>{ic}</option>))}</select></label>
        <label><span className="input-label">Language</span><Typeahead value={language} setValue={v => setLanguage(v)} options={LANGUAGES} placeholder="en" /></label>
        <label><span className="input-label">City</span><Typeahead value={city} setValue={v => setCity(v)} options={CITIES} placeholder="Austin" /></label>
        <label><span className="input-label">Country</span><Typeahead value={country} setValue={v => setCountry(v)} options={COUNTRIES} placeholder="United States" /></label>
        <label>Start from sequence template<select value={selectedTemplateId} onChange={e => setSelectedTemplateId(e.target.value)}><option value="">Empty sequence</option>{sequenceTemplates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <div className="slideout-actions"><button className="secondary-button" type="button" onClick={() => setCreateOpen(false)}>Cancel</button><button className="primary-button" disabled={saving || !orgId || !name.trim()}>{saving ? 'Savingâ€¦' : 'Create sequence'}</button></div>
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
            <label>Industry<select value={draft.industry} onChange={e => setDraft({ ...draft, industry: e.target.value })} disabled={!canWrite}><option value="">No industry</option>{industries.map(ic => (<option key={ic} value={ic}>{ic}</option>))}</select></label>
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
              <span>{step.delay_minutes === 0 ? 'Immediately' : `After ${Math.round(step.delay_minutes / 1440)} day(s)`}{step.business_days_only ? ', business days' : ''} Â· {step.time_zone_policy} time zone Â· {templateName(step.template_id)}</span>
            </div>
            {step.template_id && <button className="secondary-button" type="button" onClick={() => setPreviewStepId(step.id)}><Mail size={14} /> Preview</button>}
            {canWrite && selected.status === 'draft' && <button className="icon-only" type="button" aria-label="Delete step" disabled={saving} onClick={() => void removeStep(step)}><Trash2 size={15} /></button>}
          </li>)}</ol> : <p className="record-card-note">No steps have been added to this version.</p>}
          <SlideOut open={stepOpen && canWrite && selected.status === 'draft'} onClose={() => setStepOpen(false)} title="Add step" description="Choose what happens next and when it runs."><div className="slideout-form">
            <label>Kind<select value={stepKind} onChange={e => setStepKind(e.target.value)}><option value="email">Email</option><option value="wait">Wait</option><option value="task">Task</option><option value="condition">Condition</option></select></label>
            <label>Delay (minutes)<input inputMode="numeric" value={stepDelay} onChange={e => setStepDelay(e.target.value)} /></label>
            <label>Template<select value={stepTemplateId} onChange={e => setStepTemplateId(e.target.value)}><option value="">No template</option>{templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
            <label>Time zone<select value={stepTimeZonePolicy} onChange={e => setStepTimeZonePolicy(e.target.value)}><option value="contact">Contact</option><option value="workspace">Workspace</option><option value="utc">UTC</option></select></label>
            <label className="checkbox-label"><input type="checkbox" checked={stepBusinessDays} onChange={e => setStepBusinessDays(e.target.checked)} /> Business days only</label>
            <button className="primary-button" type="button" disabled={saving} onClick={() => void addStep()}>{saving ? 'Addingâ€¦' : 'Add step'}</button>
          </div></SlideOut>
        </section>

        <section className="record-card">
          <div className="record-card-head"><h3>Enrollments</h3>{canWrite && selected.status === 'active' && <button className="primary-button" type="button" onClick={() => { setEnrollOpen(true); setEnrollError(''); setEnrollInfo('') }}><Plus size={15} /> Enroll contacts</button>}</div>
          {sendNotice && <p className="success-message" role="status">{sendNotice}</p>}
    {dispatchNotice && <p className="success-message" role="status">{dispatchNotice}</p>}
          <div className="stat-tiles">
            <div className="stat-tile"><span>Active</span><b>{enrollmentSummary.active}</b></div>
            <div className="stat-tile"><span>Replied</span><b>{enrollmentSummary.replied}</b></div>
            <div className="stat-tile"><span>Paused</span><b>{enrollmentSummary.paused}</b></div>
            <div className="stat-tile"><span>Bounced</span><b>{enrollmentSummary.bounced}</b></div>
            <div className="stat-tile"><span>Completed</span><b>{enrollmentSummary.completed}</b></div>
            <div className="stat-tile"><span>Total</span><b>{enrollmentSummary.total}</b></div>
          </div>
          {enrollments.length ? <div className="contact-table-wrap"><table className="contact-table">
            <thead><tr><th>Contact</th><th>State</th><th>Enrolled</th><th>Next run</th><th>Reason</th><th aria-label="Actions" /></tr></thead>
            <tbody>{enrollments.map(enrollment => {
              const contact = enrollment.contacts
              const contactName = contact ? `${contact.first_name} ${contact.last_name}`.trim() : 'Unknown'
              return <tr key={enrollment.id}>
                <td><b>{contactName}</b><br /><small>{contact?.email ?? 'â€”'}</small></td>
                <td><span className={stateClass(enrollment.state)}>{enrollment.state.replace('_', ' ')}</span></td>
                <td>{new Date(enrollment.enrolled_at).toLocaleString()}</td>
                <td>{enrollment.next_run_at ? new Date(enrollment.next_run_at).toLocaleString() : 'â€”'}</td>
                <td>{enrollment.stop_reason ?? 'â€”'}</td>
                <td className="row-actions">
                  {canWrite && enrollment.state === 'active' && <button className="icon-only" title="Pause enrollment" aria-label="Pause enrollment" onClick={() => void enrollmentAction(enrollment, 'pause')}><Pause size={15} /></button>}
                  {canWrite && enrollment.state === 'paused' && <button className="icon-only" title="Resume enrollment" aria-label="Resume enrollment" onClick={() => void enrollmentAction(enrollment, 'resume')}><Play size={15} /></button>}
                  {canWrite && ['active', 'paused'].includes(enrollment.state) && <button className="icon-only" title="Stop enrollment" aria-label="Stop enrollment" onClick={() => void enrollmentAction(enrollment, 'stop')}><XCircle size={15} /></button>}
                  {canWrite && enrollment.state === 'active' && <button className="icon-only" title="Send next step now" aria-label="Send next step now" onClick={() => void sendNow(enrollment)}><Mail size={15} /></button>}
                </td>
              </tr>
            })}</tbody>
          </table></div> : <p className="record-card-note">No contacts enrolled yet.</p>}
        </section>
      </>}
    </EntityPage>

    <CenterDialog open={!!previewTemplate} onClose={() => setPreviewStepId(null)} title={previewTemplate ? previewTemplate.name : 'Preview'} description={previewTemplate?.subject ?? ''}>
      {previewTemplate && <div className="template-preview"><pre className="template-preview-text">{previewTemplate.text_body || 'Empty'}</pre>{previewTemplate.html_body && <iframe className="message-html-body" title="Preview" sandbox="" referrerPolicy="no-referrer" srcDoc={previewTemplate.html_body} />}</div>}
    </CenterDialog>

    <CenterDialog open={enrollOpen && canWrite && !!selected} onClose={() => setEnrollOpen(false)} title="Enroll contacts" description={`Each person follows their own timeline. Contacts already enrolled in this sequence are shown disabled.`}>
      <div className="slideout-form enroll-modal">
        <div className="contact-filters">
          <label className="search-label"><Search size={14} aria-hidden="true" /><input type="search" value={enrollSearch} onChange={e => setEnrollSearch(e.target.value)} placeholder="Search name, email, job title, companyâ€¦" /></label>
          <select value={enrollCompany} onChange={e => setEnrollCompany(e.target.value)}><option value="">All companies</option>{enrollCompanies.map(name => <option key={name} value={name}>{name}</option>)}</select>
          <select value={enrollLifecycle} onChange={e => setEnrollLifecycle(e.target.value)}><option value="">All lifecycles</option>{enrollLifecycles.map(value => <option key={value} value={value}>{value}</option>)}</select>
        </div>
        <div className="enroll-toolbar">
          <span><b>{Object.values(enrollSelected).filter(Boolean).length}</b> selected</span>
          <button className="text-action" type="button" onClick={() => setEnrollSelected(current => { const next = { ...current }; const toggled = selectableFiltered.every(c => next[c.id]); for (const c of selectableFiltered) next[c.id] = !toggled; return next })}>{allPageSelected ? 'Clear selection' : 'Select all'}</button>
          <button className="text-action" type="button" onClick={() => setEnrollSelected({})}>Clear</button>
        </div>
        {enrollError && <p className="inline-error" role="alert">{enrollError}</p>}
        {enrollInfo && <p className="success-message" role="status">{enrollInfo}</p>}
        <div className="contact-table-wrap enroll-list"><table className="contact-table">
          <thead><tr><th /><th>Name</th><th>Email</th><th>Company</th><th>Job title</th><th>Status</th></tr></thead>
          <tbody>
            {filteredContacts.length === 0 ? <tr><td colSpan={6}>No matching contacts.</td></tr> : filteredContacts.map(contact => {
              const enrolled = enrolledContactIds.has(contact.id)
              const companyName = contact.companies?.name ?? 'â€”'
              return <tr key={contact.id} className={enrolled ? 'row-enrolled' : ''} aria-disabled={enrolled}>
                <td><input type="checkbox" aria-label={`Enroll ${contact.first_name}`} disabled={enrolled} checked={!!enrollSelected[contact.id]} onChange={e => setEnrollSelected(current => ({ ...current, [contact.id]: e.target.checked }))} /></td>
                <td><b>{contact.first_name} {contact.last_name}</b></td>
                <td>{contact.email ?? 'â€”'}</td>
                <td>{companyName}</td>
                <td>{contact.job_title ?? 'â€”'}</td>
                <td>{enrolled ? <span className="status-chip status-chip-paused">Enrolled Â· disabled</span> : <span className="status-chip">{contact.lifecycle}</span>}</td>
              </tr>
            })}
          </tbody>
        </table></div>
        <div className="slideout-actions">
          <button className="secondary-button" type="button" onClick={() => setEnrollOpen(false)}>Cancel</button>
          <button className="primary-button" type="button" disabled={saving} onClick={() => void bulkEnroll()}>{saving ? 'Enrollingâ€¦' : `Enroll selected (${Object.values(enrollSelected).filter(Boolean).length})`}</button>
        </div>
      </div>
    </CenterDialog>
  </section>
}

function emptyKpis(): SequenceKpis {
  return { enrolled: 0, active: 0, waiting: 0, replied: 0, completed: 0, bounced: 0, unsubscribed: 0, failed: 0, emailsSent: 0, emailsCompleted: 0, emailsFailed: 0, replyRate: null, positiveReplyRate: null, bounceRate: null, completionRate: null, failureRate: null }
}
