import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { canAssignMemberRole, memberRoles, parseTeamInvite, type MemberRole } from '../lib/team-validation'

type TeamMember = { user_id: string; role: MemberRole; created_at: string; profile: { display_name: string | null; email: string | null } | null }
type AuditEntry = { id: string; actor_id: string | null; action: string; resource_type: string; resource_id: string | null; result: string; created_at: string }
type TeamResponse = { members: TeamMember[]; audit: AuditEntry[]; error?: string }
type InviteResponse = { ok?: boolean; invitationSent?: boolean; message?: string; error?: string }

async function getFunctionErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === 'object' && 'context' in error) {
    const context = (error as { context?: unknown }).context
    if (context instanceof Response) {
      const body = await context.clone().json().catch(() => null) as { error?: unknown } | null
      if (typeof body?.error === 'string') return body.error
    }
  }
  return fallback
}

export function TeamPanel({ userId, role }: { userId: string; role: string }) {
  const [organizationId, setOrganizationId] = useState('')
  const [members, setMembers] = useState<TeamMember[]>([])
  const [audit, setAudit] = useState<AuditEntry[]>([])
  const [email, setEmail] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [memberRole, setMemberRole] = useState<MemberRole>('sales_representative')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const canManage = role === 'super_admin' || role === 'sales_manager'
  const allowedRoles = memberRoles.filter(target => canAssignMemberRole(role as MemberRole, target))

  async function loadTeam(orgId: string, active: () => boolean = () => true) {
    const result = await supabase!.functions.invoke<TeamResponse>('team-admin', { body: { action: 'list', organizationId: orgId } })
    if (!active()) return
    if (result.error || result.data?.error) setError('Team and audit records could not be loaded. Check Edge Function configuration and access.')
    else { setMembers(result.data?.members ?? []); setAudit(result.data?.audit ?? []); setError('') }
    setLoading(false)
  }

  useEffect(() => {
    let active = true
    void (async () => {
      const membership = await supabase!.from('memberships').select('organization_id').eq('user_id', userId).limit(1).maybeSingle()
      if (!active) return
      if (membership.error || !membership.data) { setError('Your account is not assigned to a workspace.'); setLoading(false); return }
      setOrganizationId(membership.data.organization_id)
      await loadTeam(membership.data.organization_id, () => active)
    })()
    return () => { active = false }
  }, [userId])

  async function invite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canManage || !organizationId) return
    setError(''); setMessage('')
    const input = parseTeamInvite({ email, displayName, role: memberRole })
    if (!input || !canAssignMemberRole(role as MemberRole, input.role)) { setError('Check the email address, display name and role.'); return }
    setSaving(true)
    const result = await supabase!.functions.invoke<InviteResponse>('team-admin', { body: { action: 'invite', organizationId, ...input } })
    if (result.error || !result.data?.ok) setError(result.data?.error ?? (result.error ? await getFunctionErrorMessage(result.error, 'The invitation or workspace assignment could not be completed.') : 'The invitation or workspace assignment could not be completed.'))
    else {
      setMessage(result.data.message ?? 'Workspace access assigned.')
      setEmail(''); setDisplayName('')
      await loadTeam(organizationId)
    }
    setSaving(false)
  }

  return <div className="team-layout">
    <section className="panel team-panel">
      <div className="panel-heading"><div><h2>Workspace members</h2><p>Administrators can invite people and assign workspace roles.</p></div></div>
      {error && <p className="inline-error" role="alert">{error}</p>}
      {message && <p className="success-message" role="status">{message}</p>}
      {canManage && <form className="contact-form" onSubmit={invite}>
        <label>Email address<input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" maxLength={320} required /></label>
        <label>Name<input value={displayName} onChange={event => setDisplayName(event.target.value)} maxLength={120} /></label>
        <label>Workspace role<select value={memberRole} onChange={event => setMemberRole(event.target.value as MemberRole)}>{allowedRoles.map(item => <option key={item} value={item}>{item.replaceAll('_', ' ')}</option>)}</select></label>
        <button className="primary-button" disabled={saving || loading || !organizationId}>{saving ? 'Sending...' : 'Invite member'}</button>
      </form>}
      {loading ? <div className="table-message">Loading workspace members...</div> : members.length ? <div className="contact-table-wrap"><table className="contact-table"><thead><tr><th>Member</th><th>Email</th><th>Role</th><th>Added</th></tr></thead><tbody>{members.map(member => <tr key={member.user_id}><td>{member.profile?.display_name || 'Name not set'}</td><td>{member.profile?.email || 'Email unavailable'}</td><td className="role-label">{member.role.replaceAll('_', ' ')}</td><td>{new Date(member.created_at).toLocaleDateString()}</td></tr>)}</tbody></table></div> : !error && <div className="table-message">No workspace members were returned.</div>}
    </section>
    <section className="panel team-panel">
      <div className="panel-heading"><div><h2>Recent audit events</h2><p>Latest administrative and sensitive workspace actions.</p></div><button className="secondary-button" onClick={() => organizationId && void loadTeam(organizationId)}>Refresh</button></div>
      {!loading && audit.length ? <div className="contact-table-wrap"><table className="contact-table"><thead><tr><th>Action</th><th>Actor</th><th>Record</th><th>Result</th><th>Time</th></tr></thead><tbody>{audit.map(entry => <tr key={entry.id}><td>{entry.action}</td><td>{entry.actor_id ?? 'System'}</td><td>{entry.resource_type}{entry.resource_id ? ` · ${entry.resource_id}` : ''}</td><td>{entry.result}</td><td>{new Date(entry.created_at).toLocaleString()}</td></tr>)}</tbody></table></div> : <div className="table-message">No audit events have been recorded.</div>}
    </section>
  </div>
}
