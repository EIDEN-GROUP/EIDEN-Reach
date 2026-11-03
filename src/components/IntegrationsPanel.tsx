import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'

type Integration = { id: string; provider_key: string; display_name: string; connection_state: string; last_checked_at: string | null }
type DomainCheck = { id: string; domain: string; record_kind: string; check_state: string; checked_at: string }

export function IntegrationsPanel({ userId }: { userId: string }) {
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [domainChecks, setDomainChecks] = useState<DomainCheck[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void (async () => {
      const membership = await supabase!.from('memberships').select('organization_id').eq('user_id', userId).limit(1).maybeSingle()
      if (!active) return
      if (membership.error || !membership.data) { setError('Your account is not assigned to a workspace.'); setLoading(false); return }
      const [intRes, domRes] = await Promise.all([
        supabase!.from('integration_connections').select('id,provider_key,display_name,connection_state,last_checked_at').eq('organization_id', membership.data.organization_id).order('display_name'),
        supabase!.from('domain_auth_checks').select('id,domain,record_kind,check_state,checked_at').eq('organization_id', membership.data.organization_id).order('checked_at', { ascending: false }),
      ])
      if (!active) return
      if (intRes.error || domRes.error) setError('Integration data could not be loaded.')
      else { setIntegrations(intRes.data ?? []); setDomainChecks(domRes.data ?? []) }
      setLoading(false)
    })()
    return () => { active = false }
  }, [userId])

  return <section className="panel contacts-panel">
    <div className="panel-heading"><div><h2>Integrations</h2><p>Connected services and domain authentication checks (read-only).</p></div></div>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {loading ? <div className="table-message">Loading integrations...</div> : <>
      <h4>Integration connections</h4>
      {integrations.length ? <div className="contact-table-wrap"><table className="contact-table"><thead><tr><th>Integration</th><th>Provider</th><th>Status</th><th>Last checked</th></tr></thead><tbody>{integrations.map(integration => <tr key={integration.id}><td>{integration.display_name}</td><td>{integration.provider_key}</td><td>{integration.connection_state.replaceAll('_', ' ')}</td><td>{integration.last_checked_at ? new Date(integration.last_checked_at).toLocaleString() : 'Never'}</td></tr>)}</tbody></table></div> : <div className="table-message">No integration connections configured.</div>}
      <h4>Domain auth checks</h4>
      {domainChecks.length ? <div className="contact-table-wrap"><table className="contact-table"><thead><tr><th>Domain</th><th>Record</th><th>Status</th><th>Checked</th></tr></thead><tbody>{domainChecks.map(check => <tr key={check.id}><td>{check.domain}</td><td>{check.record_kind.toUpperCase()}</td><td>{check.check_state}</td><td>{new Date(check.checked_at).toLocaleString()}</td></tr>)}</tbody></table></div> : <div className="table-message">No domain authentication checks recorded.</div>}
      <div className="data-note"><span>Integration configuration and domain checks are managed by administrators through trusted services. No secrets are exposed in the browser.</span></div>
    </>}
  </section>
}
