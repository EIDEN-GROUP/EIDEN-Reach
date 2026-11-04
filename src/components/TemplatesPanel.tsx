import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Eye, Mail, Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { CenterDialog } from './Overlay'

type Template = {
  id: string
  name: string
  subject: string
  text_body: string | null
  html_body: string | null
  category: string
}

const MERGE_TAGS = [
  { label: 'First name', token: '{{first_name}}' },
  { label: 'Last name', token: '{{last_name}}' },
  { label: 'Company', token: '{{company}}' },
  { label: 'Email', token: '{{email}}' },
  { label: 'Sender', token: '{{sender_name}}' },
]

const defaultDraft = { name: '', subject: '', textBody: '', htmlBody: '', category: 'sales' }

export function TemplatesPanel({ userId, canWrite }: { userId: string; canWrite: boolean }) {
  const [orgId, setOrgId] = useState('')
  const [templates, setTemplates] = useState<Template[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState(defaultDraft)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [activeBody, setActiveBody] = useState<'text' | 'html'>('html')
  const textRef = useRef<HTMLTextAreaElement | null>(null)
  const htmlRef = useRef<HTMLTextAreaElement | null>(null)

  useEffect(() => {
    let active = true
    void (async () => {
      const membership = await supabase!.from('memberships').select('organization_id').eq('user_id', userId).limit(1).maybeSingle()
      if (!active) return
      if (membership.error || !membership.data) { setError('Your account is not assigned to a workspace.'); setLoading(false); return }
      setOrgId(membership.data.organization_id)
      const result = await supabase!.from('email_templates').select('id,name,subject,text_body,html_body,category').eq('organization_id', membership.data.organization_id).is('archived_at', null).order('name')
      if (!active) return
      if (result.error) setError('Templates could not be loaded.')
      else setTemplates(result.data ?? [])
      setLoading(false)
    })()
    return () => { active = false }
  }, [userId])

  function openCreate() {
    setEditingId(null)
    setDraft(defaultDraft)
    setError('')
    setModalOpen(true)
  }

  function openEdit(template: Template) {
    setEditingId(template.id)
    setDraft({
      name: template.name,
      subject: template.subject,
      textBody: template.text_body ?? '',
      htmlBody: template.html_body ?? '',
      category: template.category,
    })
    setError('')
    setModalOpen(true)
  }

  function closeModal() {
    if (saving) return
    setModalOpen(false)
    setPreviewOpen(false)
  }

  function insertTag(token: string) {
    setDraft(current => {
      const field = activeBody === 'html' ? 'htmlBody' : 'textBody'
      const value = current[field]
      return { ...current, [field]: value ? `${value} ${token}` : token }
    })
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canWrite || !orgId || !draft.name.trim()) {
      setError('Template name is required.')
      return
    }
    setSaving(true)
    setError('')
    const body = {
      name: draft.name.trim(),
      subject: draft.subject.trim(),
      text_body: draft.textBody,
      html_body: draft.htmlBody,
      category: draft.category,
    }
    let result
    if (editingId) {
      result = await supabase!.from('email_templates').update(body).eq('id', editingId).eq('organization_id', orgId).select('id,name,subject,text_body,html_body,category').single()
    } else {
      result = await supabase!.from('email_templates').insert({ organization_id: orgId, owner_id: userId, ...body }).select('id,name,subject,text_body,html_body,category').single()
    }
    if ((result as { error?: { message?: string } }).error) {
      setError('Template could not be saved.')
    } else {
      const saved = (result as { data: Template }).data
      setTemplates(current => {
        const without = current.filter(item => item.id !== saved.id)
        return [...without, saved].sort((a, b) => a.name.localeCompare(b.name))
      })
      setModalOpen(false)
    }
    setSaving(false)
  }

  async function archive(template: Template) {
    if (!canWrite || !window.confirm(`Archive ${template.name}?`)) return
    setSaving(true)
    setError('')
    const result = await supabase!.from('email_templates').update({ archived_at: new Date().toISOString() }).eq('id', template.id).eq('organization_id', orgId)
    if (result.error) setError('Template could not be archived.')
    else setTemplates(current => current.filter(item => item.id !== template.id))
    setSaving(false)
  }

  return <section className="panel contacts-panel">
    <div className="panel-heading">
      <div>
        <span className="section-kicker">Reusable content</span>
        <h2>Email templates</h2>
        <p>Create plain-text and HTML messages with personalization tags for campaigns and sequences.</p>
      </div>
      {canWrite && <button className="primary-button" type="button" onClick={openCreate} disabled={!orgId}><Plus size={16} /> New template</button>}
    </div>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {loading ? <div className="table-message">Loading templates...</div> : templates.length ? <div className="contact-table-wrap"><table className="contact-table"><thead><tr><th>Name</th><th>Subject</th><th>Category</th><th>Action</th></tr></thead><tbody>{templates.map(template => <tr key={template.id}><td><button className="text-action" type="button" onClick={() => openEdit(template)}>{template.name}</button></td><td>{template.subject || '—'}</td><td>{template.category}</td><td>{canWrite && <button className="archive-button" type="button" onClick={() => void archive(template)}>Archive</button>}</td></tr>)}</tbody></table></div> : !error && <div className="table-message">No templates yet. {canWrite ? 'Create one above.' : 'No templates are available.'}</div>}

    <CenterDialog open={modalOpen} onClose={closeModal} title={editingId ? 'Update email template' : 'Create email template'} description="Use personalization tags and include both plain text and HTML bodies for mailbox compatibility.">
        <form className="contact-form template-form" onSubmit={save}>
          <div className="template-grid">
            <label>Name<input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} required maxLength={200} /></label>
            <label>Category<select value={draft.category} onChange={e => setDraft({ ...draft, category: e.target.value })}><option value="sales">sales</option><option value="marketing">marketing</option><option value="transactional">transactional</option></select></label>
          </div>
          <label>Subject<input value={draft.subject} onChange={e => setDraft({ ...draft, subject: e.target.value })} maxLength={300} placeholder="Welcome to {{company}}" /></label>
          <div className="merge-tag-row" aria-label="Personalization tags">
            {MERGE_TAGS.map(tag => <button key={tag.token} type="button" className="secondary-button merge-tag" onClick={() => insertTag(tag.token)}>{tag.label}</button>)}
          </div>
          <div className="body-mode-tabs" role="tablist" aria-label="Message body format">
            <button type="button" role="tab" aria-selected={activeBody === 'html'} className={`secondary-button ${activeBody === 'html' ? 'active' : ''}`} onClick={() => setActiveBody('html')}><Mail size={15} /> HTML body</button>
            <button type="button" role="tab" aria-selected={activeBody === 'text'} className={`secondary-button ${activeBody === 'text' ? 'active' : ''}`} onClick={() => setActiveBody('text')}><Mail size={15} /> Text body</button>
            <button type="button" className="secondary-button" onClick={() => setPreviewOpen(current => !current)}><Eye size={15} /> {previewOpen ? 'Hide preview' : 'Preview'}</button>
          </div>
          {activeBody === 'html' ? (
            <label>HTML body<textarea ref={htmlRef} onFocus={() => setActiveBody('html')} value={draft.htmlBody} onChange={e => setDraft({ ...draft, htmlBody: e.target.value })} rows={12} maxLength={50000} placeholder="<p>Hello {{first_name}},</p>" /></label>
          ) : (
            <label>Text body<textarea ref={textRef} onFocus={() => setActiveBody('text')} value={draft.textBody} onChange={e => setDraft({ ...draft, textBody: e.target.value })} rows={12} maxLength={20000} placeholder="Hello {{first_name}}," /></label>
          )}
          {previewOpen && <div className="template-preview" aria-label="Email preview">
            <span className="section-kicker">Preview</span>
            <h4>{draft.subject || 'Untitled template'}</h4>
            {activeBody === 'html' && draft.htmlBody ? <iframe className="message-html-body" title="Template HTML preview" sandbox="" referrerPolicy="no-referrer" srcDoc={draft.htmlBody} /> : <pre className="template-preview-text">{draft.textBody || 'Empty message'}</pre>}
          </div>}
          <div className="form-actions">
            <button className="secondary-button" type="button" onClick={closeModal} disabled={saving}>Cancel</button>
            <button className="primary-button" type="submit" disabled={saving || !orgId}>{saving ? 'Saving...' : editingId ? 'Save template' : 'Create template'}</button>
          </div>
        </form>
    </CenterDialog>
  </section>
}
