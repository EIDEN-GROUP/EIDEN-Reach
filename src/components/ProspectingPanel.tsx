import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { CheckCircle2, FileDown, FileUp, Lock, UserPlus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { SlideOut, CenterDialog } from './Overlay'

export type PreviewRow = {
  firstName: string
  lastName: string
  email: string | null
  phone: string | null
  jobTitle: string | null
  companyName: string | null
  companyDomain: string | null
  industry: string | null
  location: string | null
}

const EXAMPLE_CSV = `first_name,last_name,email,phone,job_title,company_name,company_domain,industry,location
Ada,Lovelace,ada@example.com,+1 555 0101,Managing Director,Example Holdings,example.com,Manufacturing,Austin TX
Grace,Hopper,grace@example.com,+1 555 0102,Operations Lead,Northwind Labs,northwind.example,Logistics,Chicago IL
`

export function ProspectingPanel({ userId, canWrite }: { userId: string; canWrite: boolean }) {
  const [orgId, setOrgId] = useState('')
  const [csv, setCsv] = useState('')
  const [preview, setPreview] = useState<PreviewRow[]>([])
  const [importOpen, setImportOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
  const [companies, setCompanies] = useState<{ id: string; name: string }[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [addForm, setAddForm] = useState({ firstName: '', lastName: '', email: '', phone: '', jobTitle: '', companyId: '', companyName: '', companyDomain: '', industry: '', location: '' })

  useEffect(() => {
    let active = true
    void (async () => {
      const membership = await supabase!.from('memberships').select('organization_id').eq('user_id', userId).limit(1).maybeSingle()
      if (!active) return
      if (membership.data) {
        setOrgId(membership.data.organization_id)
        const res = await supabase!.from('companies').select('id,name').eq('organization_id', membership.data.organization_id).is('archived_at', null).order('name').limit(500)
        if (!active) return
        if (!res.error) setCompanies(res.data ?? [])
      }
      setLoading(false)
    })()
    return () => { active = false }
  }, [userId])

  function downloadExampleCsv() {
    const blob = new Blob([EXAMPLE_CSV], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'eiden-reach-example.csv'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  function handleAddNameField(field: keyof typeof addForm, value: string) { setAddForm(current => ({ ...current, [field]: value })) }

  async function createContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canWrite || !orgId) return
    setSaving(true)
    setError('')
    setMessage('')
    try {
      const email = addForm.email.trim().toLowerCase()
      if (!addForm.firstName.trim() || !email) {
        setError('First name and email are required.')
        setSaving(false)
        return
      }
      let companyId = addForm.companyId || null
      if (!companyId && addForm.companyName.trim()) {
        const insertedCompany = await supabase!.from('companies').insert({ organization_id: orgId, name: addForm.companyName.trim(), domain: addForm.companyDomain.trim() || null, industry: addForm.industry.trim() || null, location: addForm.location.trim() || null, owner_id: userId, created_by: userId }).select('id,name').single()
        if (insertedCompany.error) {
          setError(insertedCompany.error.code === '23505' ? 'A company with that domain already exists.' : 'Company could not be created.')
          setSaving(false)
          return
        }
        companyId = insertedCompany.data.id
        setCompanies(current => [...current, insertedCompany.data].sort((a, b) => a.name.localeCompare(b.name)))
      }
      const result = await supabase!.from('contacts').insert({ organization_id: orgId, first_name: addForm.firstName.trim(), last_name: addForm.lastName.trim() || '', email, phone: addForm.phone.trim() || null, job_title: addForm.jobTitle.trim() || null, company_id: companyId, owner_id: userId, created_by: userId, lifecycle: 'new', source: 'manual' }).select('id')
      if (result.error) {
        setError(result.error.code === '23505' ? 'A contact with that email already exists.' : 'Contact could not be saved.')
        setSaving(false)
        return
      }
      setMessage('Contact added.')
      setAddForm({ firstName: '', lastName: '', email: '', phone: '', jobTitle: '', companyId: '', companyName: '', companyDomain: '', industry: '', location: '' })
      setAddOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Contact could not be saved.')
    } finally {
      setSaving(false)
    }
  }

  function parse() {
    const rows = csv.trim().split(/\r?\n/).filter(Boolean)
    const header = rows.length ? rows[0].split(',').map(s => s.trim().toLowerCase().replace(/^"|"$/g, '')) : []
    const index = (key: string) => header.indexOf(key)
    const parsed: PreviewRow[] = []
    const start = index('first_name') !== -1 ? 1 : 0
    for (let i = start; i < rows.length; i++) {
      const parts = rows[i].split(',').map(s => s.trim().replace(/^"|"$/g, ''))
      const get = (key: string) => {
        const idx = index(key)
        return idx === -1 ? '' : parts[idx] ?? ''
      }
      const firstName = get('first_name') || parts[0]
      if (!firstName) continue
      parsed.push({
        firstName,
        lastName: get('last_name') || parts[1] || '',
        email: (get('email') || parts[2] || '').toLowerCase() || null,
        phone: get('phone') || null,
        jobTitle: get('job_title') || null,
        companyName: get('company_name') || null,
        companyDomain: get('company_domain') || null,
        industry: get('industry') || null,
        location: get('location') || null,
      })
    }
    setPreview(parsed)
    setMessage('')
    setError(parsed.length ? '' : 'No valid rows found. Download the example CSV to see the required format.')
  }

  async function importRows(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canWrite || !orgId || preview.length === 0) return
    setSaving(true)
    setError('')
    try {
      // company cache for the batch
      const companyCache = new Map<string, string>()
      const getCompanyId = async (row: PreviewRow): Promise<string | null> => {
        const key = (row.companyDomain || row.companyName || '').toLowerCase().trim()
        if (!key) return null
        if (companyCache.has(key)) return companyCache.get(key)!
        let res = await supabase!.from('companies').select('id').eq('organization_id', orgId).is('archived_at', null).or(`domain.ilike.${row.companyDomain || '___none___'},name.ilike.${row.companyName || '___none___'}`).limit(1).maybeSingle()
        if (!res.data && (row.companyDomain || row.companyName)) {
          const inserted = await supabase!.from('companies').insert({ organization_id: orgId, name: row.companyName || row.companyDomain || 'Unknown', domain: row.companyDomain || null, industry: row.industry || null, location: row.location || null, owner_id: userId, created_by: userId }).select('id').single()
          if (inserted.data) res = { data: { id: inserted.data.id }, error: null } as typeof res
        }
        const id = res.data?.id ?? null
        if (id) companyCache.set(key, id)
        return id
      }
      const existingEmails = new Set<string>()
      const existing = await supabase!.from('contacts').select('email').eq('organization_id', orgId).is('archived_at', null).not('email', 'is', null).in('email', preview.map(p => p.email).filter(Boolean) as string[])
      for (const row of existing.data ?? []) if (row.email) existingEmails.add(row.email.toLowerCase())
      let imported = 0
      const failures: string[] = []
      for (const row of preview) {
        if (!row.email) { failures.push(`${row.firstName} ${row.lastName}: missing email`); continue }
        if (existingEmails.has(row.email)) { failures.push(`${row.email}: duplicate — skipped`); continue }
        const companyId = await getCompanyId(row)
        const result = await supabase!.from('contacts').insert({ organization_id: orgId, first_name: row.firstName, last_name: row.lastName, email: row.email, phone: row.phone || null, job_title: row.jobTitle || null, company_id: companyId, owner_id: userId, created_by: userId, lifecycle: 'new', source: 'csv_import' })
        if (result.error) {
          if (result.error.code === '23505') failures.push(`${row.email}: duplicate — skipped`)
          else failures.push(`${row.email}: ${result.error.message}`)
        } else {
          imported += 1
          existingEmails.add(row.email)
        }
      }
      if (failures.length) {
        const blob = new Blob([failures.join('\n')], { type: 'text/plain' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'eiden-reach-import-errors.csv.txt'
        a.click()
        URL.revokeObjectURL(url)
      }
      setMessage(`Imported ${imported}. ${failures.length} row(s) skipped (duplicates or missing email).`)
      setCsv('')
      setPreview([])
      setImportOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed.')
    } finally {
      setSaving(false)
    }
  }

  function closeImport() {
    setImportOpen(false)
    setError('')
  }

  return <section className="panel sequences-panel">
    <div className="panel-heading">
      <div><h2>Prospecting</h2><p>Bring in people you already have permission to contact.</p></div>
      {canWrite && <div className="panel-actions"><button className="secondary-button" type="button" onClick={downloadExampleCsv}><FileDown size={15} /> Download example CSV</button><button className="primary-button" type="button" disabled={loading || !orgId} onClick={() => setImportOpen(true)}><FileUp size={15} /> Import contacts</button><button className="secondary-button" type="button" disabled={loading || !orgId} onClick={() => setAddOpen(true)}><UserPlus size={15} /> Add contact</button></div>}
    </div>
    {message && <p className="success-message" role="status">{message}</p>}
    {error && !importOpen && !addOpen && <p className="inline-error" role="alert">{error}</p>}
    {loading ? <div className="table-message">Loading...</div> : <>
      <div className="source-grid">
        <section className="record-card">
          <div className="record-card-head"><h3>Manual CSV import</h3><CheckCircle2 size={18} className="check-ok" aria-label="Available" /></div>
          <p className="record-card-note">Paste rows with <code>first_name,last_name,email,phone,job_title,company_name,company_domain,industry,location</code>. Download the example CSV for the exact format. Each row becomes a contact you own.</p>
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

    <CenterDialog open={addOpen} onClose={() => setAddOpen(false)} title="Add contact" description="Enter the person’s details as you obtained them from an authorized source.">
      <form className="contact-form" onSubmit={createContact}>
        <label>First name<input value={addForm.firstName} onChange={e => handleAddNameField('firstName', e.target.value)} required maxLength={100} /></label>
        <label>Last name<input value={addForm.lastName} onChange={e => handleAddNameField('lastName', e.target.value)} maxLength={100} /></label>
        <label>Email<input type="email" value={addForm.email} onChange={e => handleAddNameField('email', e.target.value)} required maxLength={320} /></label>
        <label>Phone<input value={addForm.phone} onChange={e => handleAddNameField('phone', e.target.value)} maxLength={40} placeholder="+1 555 0101" /></label>
        <label>Job title<input value={addForm.jobTitle} onChange={e => handleAddNameField('jobTitle', e.target.value)} maxLength={200} placeholder="Managing Director" /></label>
        <div className="template-grid">
          <label>Link to existing company<select value={addForm.companyId} onChange={e => handleAddNameField('companyId', e.target.value)}><option value="">— create a new one —</option>{companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
          <label>Company name<input value={addForm.companyName} onChange={e => handleAddNameField('companyName', e.target.value)} maxLength={200} placeholder="Example Holdings" disabled={!!addForm.companyId} /></label>
          <label>Company domain<input value={addForm.companyDomain} onChange={e => handleAddNameField('companyDomain', e.target.value)} maxLength={253} placeholder="example.com" disabled={!!addForm.companyId} /></label>
          <label>Industry<input value={addForm.industry} onChange={e => handleAddNameField('industry', e.target.value)} maxLength={100} disabled={!!addForm.companyId} /></label>
          <label className="span-2">Location<input value={addForm.location} onChange={e => handleAddNameField('location', e.target.value)} maxLength={160} placeholder="Austin TX" disabled={!!addForm.companyId} /></label>
        </div>
        {error && <p className="inline-error" role="alert">{error}</p>}
        <div className="slideout-actions"><button className="secondary-button" type="button" onClick={() => setAddOpen(false)}>Cancel</button><button className="primary-button" disabled={saving || !orgId}>{saving ? 'Adding…' : 'Add contact'}</button></div>
      </form>
    </CenterDialog>

    <SlideOut open={importOpen && canWrite} onClose={closeImport} title="Import contacts" description="Paste CSV, check the preview, then import.">
      <div className="slideout-form">
        <label>CSV rows<textarea value={csv} onChange={e => setCsv(e.target.value)} rows={6} placeholder="first_name,last_name,email,phone,job_title,company_name,company_domain,industry,location" /></label>
        <div className="slideout-actions"><button className="secondary-button" type="button" onClick={parse} disabled={!csv.trim()}>Preview rows</button><button className="text-action" type="button" onClick={downloadExampleCsv}>Download example CSV</button></div>
        {error && <p className="inline-error" role="alert">{error}</p>}
        {preview.length > 0 && <form className="import-preview" onSubmit={importRows}>
          <p className="record-card-note">{preview.length} row(s) ready to import. Duplicates are skipped automatically.</p>
          <div className="contact-table-wrap"><table className="contact-table"><thead><tr><th>Name</th><th>Email</th><th>Company</th><th>Title</th></tr></thead><tbody>{preview.slice(0, 50).map((p, i) => <tr key={i}><td>{p.firstName} {p.lastName}</td><td>{p.email ?? '—'}</td><td>{p.companyName ?? '—'}</td><td>{p.jobTitle ?? '—'}</td></tr>)}</tbody></table></div>
          <div className="slideout-actions"><button className="secondary-button" type="button" onClick={closeImport}>Cancel</button><button className="primary-button" type="submit" disabled={saving || !orgId}>{saving ? 'Importing…' : `Import ${preview.length} contacts`}</button></div>
        </form>}
      </div>
    </SlideOut>
  </section>
}
