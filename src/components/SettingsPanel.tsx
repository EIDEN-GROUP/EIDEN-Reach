import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Member = { organization_id: string; role: string }

export function SettingsPanel({ userId }: { userId: string }) {
  const [orgName, setOrgName] = useState('')
  const [role, setRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void (async () => {
      const membership = await supabase!.from('memberships').select('organization_id,role').eq('user_id', userId).limit(1).maybeSingle()
      if (!active) return
      if (membership.error || !membership.data) { setError('Your account is not assigned to a workspace.'); setLoading(false); return }
      setRole((membership.data as Member).role)
      const org = await supabase!.from('organizations').select('name').eq('id', (membership.data as Member).organization_id).maybeSingle()
      if (active) setOrgName(org.data?.name ?? '')
      setLoading(false)
    })()
    return () => { active = false }
  }, [userId])

  const dbConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)
  const mailboxConfigured = Boolean(import.meta.env.VITE_MAILBOX_WORKER_URL)

  return <section className="panel contacts-panel">
    <div className="panel-heading"><div><h2>Settings</h2><p>Workspace preferences and setup status (read-only).</p></div></div>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {loading ? <div className="table-message">Loading settings...</div> : <>
      <dl className="contact-readonly">
        <dt>Workspace</dt><dd>{orgName || 'Not set'}</dd>
        <dt>Your role</dt><dd>{role ? role.replaceAll('_', ' ') : 'No membership'}</dd>
        <dt>Database</dt><dd>{dbConfigured ? 'Configured' : 'Not configured'}</dd>
        <dt>Mailbox worker</dt><dd>{mailboxConfigured ? 'Configured' : 'Not configured'}</dd>
      </dl>
      <div className="data-note"><span>Secrets and trusted credentials are managed in the server platform's secret store, never in the browser. Workspace mutation settings are not yet editable from this screen.</span></div>
    </>}
  </section>
}
