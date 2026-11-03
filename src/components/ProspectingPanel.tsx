import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'

export function ProspectingPanel({ userId, canWrite }: { userId: string; canWrite: boolean }) {
  const [orgId, setOrgId] = useState('')
  const [csv, setCsv] = useState('')
  const [preview, setPreview] = useState<Array<{ firstName: string; lastName: string; email: string | null }>>([])
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
    const parsed: Array<{ firstName: string; lastName: string; email: string | null }> = []
    for (const row of rows) {
      const parts = row.split(',').map(s => s.trim().replace(/^"|"$/g, ''))
      if (parts.length < 2) continue
      const [firstName, lastName, email] = parts
      if (!firstName) continue
      parsed.push({ firstName, lastName: lastName ?? '', email: email || null })
    }
    setPreview(parsed)
    setMessage('')
    setError('')
  }

  async function importRows(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canWrite || !orgId || preview.length === 0) return
    setSaving(true)
    setError('')
    const payload = preview.map(p => ({ organization_id: orgId, first_name: p.firstName, last_name: p.lastName, email: p.email, owner_id: userId, created_by: userId, lifecycle: 'new' }))
    const result = await supabase!.from('contacts').insert(payload)
    if (result.error) setError('Import failed. Check for duplicate emails or permissions.')
    else { setMessage(`Imported ${payload.length} contacts.`); setCsv(''); setPreview([]) }
    setSaving(false)
  }

  return <section className="panel contacts-panel">
    <div className="panel-heading"><div><h2>Prospecting</h2><p>Manual import and provider research. Provider-based enrichment is not enabled.</p></div></div>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {message && <p className="success-message" role="status">{message}</p>}
    {loading ? <div className="table-message">Loading...</div> : <>
      <p>Paste CSV with columns: <code>first_name,last_name,email</code> (one per line).</p>
      <textarea value={csv} onChange={e => setCsv(e.target.value)} rows={6} style={{ width: '100%' }} placeholder="Ada,Lovelace,ada@example.com" />
      <div className="mailbox-actions" style={{ marginTop: 8 }}>
        <button className="secondary-button" type="button" onClick={parse} disabled={!csv.trim()}>Preview</button>
      </div>
      {preview.length > 0 && <form onSubmit={importRows}>
        <div className="contact-table-wrap"><table className="contact-table"><thead><tr><th>First name</th><th>Last name</th><th>Email</th></tr></thead><tbody>{preview.map((p, i) => <tr key={i}><td>{p.firstName}</td><td>{p.lastName}</td><td>{p.email ?? '—'}</td></tr>)}</tbody></table></div>
        {canWrite && <button className="primary-button" type="submit" disabled={saving || !orgId}>{saving ? 'Importing...' : `Import ${preview.length} contacts`}</button>}
      </form>}
      <div className="data-note"><span>Provider-based enrichment requires a licensed data provider and is not enabled. Only manually supplied data is imported.</span></div>
    </>}
  </section>
}
