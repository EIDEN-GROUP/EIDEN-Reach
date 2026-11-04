import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { CheckCircle2, FileUp, Lock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { SlideOut } from './Overlay'

type PreviewRow = { firstName: string; lastName: string; email: string | null }

export function ProspectingPanel({ userId, canWrite }: { userId: string; canWrite: boolean }) {
  const [orgId, setOrgId] = useState('')
  const [csv, setCsv] = useState('')
  const [preview, setPreview] = useState<PreviewRow[]>([])
  const [importOpen, setImportOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    void (async () => {
      const membership = await supabase!.from('memberships').select('organization_id').eq('user_id', userId).limit(1).maybeSingle()
      if (!active) return
      if (membership.data) setOrgId(membership.data.organization_id)
      setLoading(false)
    })()
    return () => { active = false }
  }, [userId])

  function parse() {
    const rows = csv.trim().split(/\r?\n/).filter(Boolean)
    const parsed: PreviewRow[] = []
    for (const row of rows) {
      const parts = row.split(',').map(s => s.trim().replace(/^"|"$/g, ''))
      if (parts.length < 2) continue
      const [firstName, lastName, email] = parts
      if (!firstName) continue
      parsed.push({ firstName, lastName: lastName ?? '', email: email || null })
    }
    setPreview(parsed)
    setMessage('')
    setError(parsed.length ? '' : 'No valid rows found. Use the format first_name,last_name,email.')
  }

  async function importRows(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canWrite || !orgId || preview.length === 0) return
    setSaving(true)
    setError('')
    const payload = preview.map(p => ({ organization_id: orgId, first_name: p.firstName, last_name: p.lastName, email: p.email, owner_id: userId, created_by: userId, lifecycle: 'new' }))
    const result = await supabase!.from('contacts').insert(payload)
    if (result.error) setError('Import failed. Check for duplicate emails or permissions.')
    else {
      setMessage(`Imported ${payload.length} contacts.`)
      setCsv(''); setPreview([]); setImportOpen(false)
    }
    setSaving(false)
  }

  function closeImport() {
    setImportOpen(false)
    setError('')
  }

  return <section className="panel sequences-panel">
    <div className="panel-heading">
      <div><h2>Prospecting</h2><p>Bring in people you already have permission to contact.</p></div>
      {canWrite && <div className="panel-actions"><button className="primary-button" type="button" disabled={loading || !orgId} onClick={() => setImportOpen(true)}><FileUp size={15} /> Import contacts</button></div>}
    </div>
    {message && <p className="success-message" role="status">{message}</p>}
    {error && !importOpen && <p className="inline-error" role="alert">{error}</p>}
    {loading ? <div className="table-message">Loading...</div> : <>
      <div className="source-grid">
        <section className="record-card">
          <div className="record-card-head"><h3>Manual CSV import</h3><CheckCircle2 size={18} className="check-ok" aria-label="Available" /></div>
          <p className="record-card-note">Paste rows with <code>first_name, last_name, email</code>. Each row becomes a contact you own.</p>
          <div><span className="status-chip status-chip-active">Available</span></div>
        </section>
        <section className="record-card">
          <div className="record-card-head"><h3>Provider enrichment</h3><Lock size={18} aria-label="Locked" /></div>
          <p className="record-card-note">Search and verify contacts through a licensed data provider. Requires provider authorization before it can be enabled.</p>
          <div><span className="status-chip">Not connected</span></div>
        </section>
      </div>
      <div className="data-note"><span>Only data you supply, or data from a licensed provider, is imported. Emails are not marked as verified unless a provider verified them.</span></div>
    </>}

    <SlideOut open={importOpen && canWrite} onClose={closeImport} title="Import contacts" description="Paste CSV, check the preview, then import.">
      <div className="slideout-form">
        <label>CSV rows<textarea value={csv} onChange={e => setCsv(e.target.value)} rows={8} placeholder={'Ada,Lovelace,ada@example.com\nGrace,Hopper,grace@example.com'} /></label>
        <div className="slideout-actions"><button className="secondary-button" type="button" onClick={parse} disabled={!csv.trim()}>Preview rows</button></div>
        {error && <p className="inline-error" role="alert">{error}</p>}
        {preview.length > 0 && <form className="import-preview" onSubmit={importRows}>
          <p className="record-card-note">{preview.length} row(s) ready to import.</p>
          <div className="contact-table-wrap"><table className="contact-table"><thead><tr><th>First name</th><th>Last name</th><th>Email</th></tr></thead><tbody>{preview.map((p, i) => <tr key={i}><td>{p.firstName}</td><td>{p.lastName}</td><td>{p.email ?? '—'}</td></tr>)}</tbody></table></div>
          <div className="slideout-actions"><button className="secondary-button" type="button" onClick={closeImport}>Cancel</button><button className="primary-button" type="submit" disabled={saving || !orgId}>{saving ? 'Importing…' : `Import ${preview.length} contacts`}</button></div>
        </form>}
      </div>
    </SlideOut>
  </section>
}
