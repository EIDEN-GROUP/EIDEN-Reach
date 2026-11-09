import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { canAssignMemberRole, memberRoles, parseTeamInvite, type MemberRole } from '../lib/team-validation'
import { CenterDialog } from './Overlay'

type ManagedWorkspace = {
  id: string
  name: string
  createdAt: string
  memberCount: number
  enrollmentCount: number
  enrollmentsByState: Record<string, number>
  sentCount: number
  ownerEmail: string | null
  ownerName: string | null
}
/** Raw Edge Function list() payload: tolerate both the current and the legacy key. */
type ManagedWorkspaceWire = Omit<ManagedWorkspace, 'enrollmentsByState'> & {
  enrollmentsByState?: Record<string, number>
  enrollmentStates?: Record<string, number>
}
type WorkspaceListResponse = { workspaces?: ManagedWorkspaceWire[]; error?: string }
type WorkspaceKpisResponse = { workspaceId: string; enrollmentsByState: Record<string, number>; emailsSent: number; contactsTotal: number; suppressed: number; error?: string }
type WorkspaceEmail = {
  id: string
  direction: string
  subject: string | null
  snippet: string | null
  receivedAt: string | null
  sentAt: string | null
  threadId: string | null
  participants: Array<{ participant_type: string; email_address: string }>
}
type WorkspaceEmailListResponse = { emails?: WorkspaceEmail[]; error?: string }
type WorkspaceEmailDetailResponse = { id: string; direction: string; subject: string | null; receivedAt: string | null; sentAt: string | null; textBody: string | null; htmlBody: string | null; error?: string }

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
  const [tab, setTab] = useState<'members' | 'workspaces'>(role === 'super_admin' ? 'workspaces' : 'members')
  const isSuperAdmin = role === 'super_admin'

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

  // Managed workspaces state
  const [workspaces, setWorkspaces] = useState<ManagedWorkspace[]>([])
  const [wsError, setWsError] = useState('')
  const [wsLoading, setWsLoading] = useState(false)
  const [wsSaving, setWsSaving] = useState(false)
  const [wsMessage, setWsMessage] = useState('')
  const [wsEmail, setWsEmail] = useState('')
  const [wsDisplayName, setWsDisplayName] = useState('')
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null)
  const [selectedKpis, setSelectedKpis] = useState<WorkspaceKpisResponse | null>(null)
  const [selectedEmails, setSelectedEmails] = useState<WorkspaceEmail[]>([])
  const [openEmailId, setOpenEmailId] = useState<string | null>(null)
  const [openEmailDetail, setOpenEmailDetail] = useState<WorkspaceEmailDetailResponse | null>(null)
  const [openEmailLoading, setOpenEmailLoading] = useState(false)
  const canManage = role === 'super_admin' || role === 'sales_manager'
  const allowedRoles = memberRoles.filter(target => canAssignMemberRole(role as MemberRole, target))

  async function loadTeam(orgId: string, active: () => boolean = () => true) {
    const result = await supabase!.functions.invoke<TeamResponse>('team-admin', { body: { action: 'list', organizationId: orgId } })
    if (!active()) return
    if (result.error || result.data?.error) setError('Team and audit records could not be loaded. Check Edge Function configuration and access.')
    else { setMembers(result.data?.members ?? []); setAudit(result.data?.audit ?? []); setError('') }
    setLoading(false)
  }

  async function loadWorkspaces(active: () => boolean = () => true) {
    if (!isSuperAdmin) { setWsLoading(false); return }
    setWsLoading(true)
    const result = await supabase!.functions.invoke<WorkspaceListResponse>('workspace-admin', { body: { action: 'list' } })
    if (!active()) return
    if (result.error || result.data?.error) { setWsError('Managed workspaces could not be loaded. Check the Edge Function configuration and access.'); setWorkspaces([]) }
    else {
      const normalized = (result.data?.workspaces ?? []).map(workspace => ({
        ...workspace,
        enrollmentsByState: workspace.enrollmentsByState ?? workspace.enrollmentStates ?? {},
      }))
      setWorkspaces(normalized); setWsError('')
    }
    setWsLoading(false)
  }

  async function loadWorkspaceDetails(workspaceId: string, active: () => boolean = () => true) {
    const [kpiRes, emailsRes] = await Promise.all([
      supabase!.functions.invoke<WorkspaceKpisResponse>('workspace-admin', { body: { action: 'kpis', workspaceId } }),
      supabase!.functions.invoke<WorkspaceEmailListResponse>('workspace-admin', { body: { action: 'emails', workspaceId, limit: 20 } }),
    ])
    if (!active()) return
    if (kpiRes.error || kpiRes.data?.error || emailsRes.error || emailsRes.data?.error) { setWsError('Workspace details could not be loaded.'); return }
    setSelectedKpis(kpiRes.data ?? null)
    setSelectedEmails(emailsRes.data?.emails ?? [])
    setWsError('')
  }

  async function openWorkspace(workspaceId: string) {
    setSelectedWorkspaceId(workspaceId)
    setWsMessage('')
    await loadWorkspaceDetails(workspaceId)
  }

  async function openEmail(emailId: string) {
    if (!selectedWorkspaceId) return
    setOpenEmailId(emailId)
    setOpenEmailDetail(null)
    setOpenEmailLoading(true)
    const result = await supabase!.functions.invoke<WorkspaceEmailDetailResponse>('workspace-admin', { body: { action: 'email', workspaceId: selectedWorkspaceId, emailId } })
    setOpenEmailDetail(result.data ?? null)
    setOpenEmailLoading(false)
  }

  async function inviteToNewWorkspace(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!isSuperAdmin) return
    setWsSaving(true); setWsMessage(''); setWsError('')
    if (!wsEmail.trim()) { setWsSaving(false); return }
    if (!window.confirm(`Create a new workspace owned by ${wsEmail.trim()} and send them an invitation?`)) { setWsSaving(false); return }
    const result = await supabase!.functions.invoke<{ ok?: boolean; invitationSent?: boolean; organizationId?: string; message?: string; error?: string }>('workspace-admin', { body: { action: 'invite', email: wsEmail.trim(), displayName: wsDisplayName.trim() } })
    if (result.error || !result.data?.ok) setWsError(result.data?.error ?? (result.error ? await getFunctionErrorMessage(result.error, 'The workspace could not be created.') : 'The workspace could not be created.'))
    else {
      setWsMessage(result.data.message ?? 'Workspace created and invitation sent.')
      setWsEmail(''); setWsDisplayName('')
      await loadWorkspaces()
    }
    setWsSaving(false)
  }

  useEffect(() => {
    let active = true
    void (async () => {
      const membership = await supabase!.from('memberships').select('organization_id').eq('user_id', userId).limit(1).maybeSingle()
      if (!active) return
      if (membership.error || !membership.data) { setError('Your account is not assigned to a workspace.'); setLoading(false); setWsLoading(false); return }
      setOrganizationId(membership.data.organization_id)
      await loadTeam(membership.data.organization_id, () => active)
      if (isSuperAdmin) await loadWorkspaces(() => active)
      else setWsLoading(false)
    })()
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, role])

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

  const selectedWorkspace = selectedWorkspaceId ? workspaces.find(w => w.id === selectedWorkspaceId) : null
  const emailsByWorkspace = selectedEmails
  const DirectionLabel = ({ value }: { value: string }) => value === 'inbound'
    ? <span className="status-chip status-chip-active">Inbound</span>
    : <span className="status-chip status-chip-completed">Outbound</span>

  function fromLine(participants: WorkspaceEmail['participants']): string {
    const from = participants.find(p => p.participant_type === 'from')
    return from?.email_address ?? participants[0]?.email_address ?? 'Unknown sender'
  }

  return <div className="team-layout">
    {isSuperAdmin && (
      <div className="tabs-row" aria-label="Team view switcher">
        <button type="button" className={`tab-button${tab === 'members' ? ' active' : ''}`} onClick={() => setTab('members')}><strong>Members &amp; audit</strong><small>Current workspace team and audit</small></button>
        <button type="button" className={`tab-button${tab === 'workspaces' ? ' active' : ''}`} onClick={() => setTab('workspaces')}><strong>Managed workspaces</strong><small>Workspaces created under this root</small></button>
      </div>
    )}
    {tab === 'members' || !isSuperAdmin ? (
      <>
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
      </>
    ) : (
      <>
        <section className="panel team-panel">
          <div className="panel-heading">
            <div><h2>Managed workspaces</h2><p>Only super_admins of the root workspace are shown these. Each invited person gets their own isolated workspace.</p></div>
            <button className="secondary-button" type="button" onClick={() => void loadWorkspaces()}>Refresh</button>
          </div>
          {wsError && <p className="inline-error" role="alert">{wsError}</p>}
          {wsMessage && <p className="success-message" role="status">{wsMessage}</p>}
          {isSuperAdmin && (
            <form className="contact-form" onSubmit={inviteToNewWorkspace}>
              <label>Invite email<input type="email" value={wsEmail} onChange={event => setWsEmail(event.target.value)} maxLength={320} autoComplete="email" required placeholder="person@example.com" /></label>
              <label>Display name<input value={wsDisplayName} onChange={event => setWsDisplayName(event.target.value)} maxLength={120} placeholder="Alex Johnson" /></label>
              <button className="primary-button" disabled={wsSaving || !wsEmail.trim()}>{wsSaving ? 'Creating…' : 'Create workspace & invite'}</button>
            </form>
          )}
          {wsLoading ? <div className="table-message">Loading managed workspaces…</div> : workspaces.length ? <div className="contact-table-wrap"><table className="contact-table"><thead><tr><th>Workspace</th><th>Owner</th><th>Members</th><th>Active enrollments</th><th>Emails sent</th><th aria-label="Action" /></tr></thead><tbody>{workspaces.map(workspace => (
            <tr key={workspace.id} className={selectedWorkspaceId === workspace.id ? 'row-selected' : ''}>
              <td><button className="text-action" type="button" onClick={() => void openWorkspace(workspace.id)}><b>{workspace.name}</b></button><br /><small>{new Date(workspace.createdAt).toLocaleDateString()}</small></td>
              <td>{workspace.ownerName ?? workspace.ownerEmail ?? 'Unassigned'}</td>
              <td>{workspace.memberCount}</td>
              <td>{(workspace.enrollmentsByState.active ?? 0) + (workspace.enrollmentsByState.pending ?? 0)}</td>
              <td>{workspace.sentCount}</td>
              <td className="row-actions"><button className="icon-only" type="button" aria-label="View workspace" onClick={() => void openWorkspace(workspace.id)}>Open</button></td>
            </tr>
          ))}</tbody></table></div> : <div className="table-message">No managed workspaces yet. Create one above.</div>}
        </section>
        {selectedWorkspace && selectedKpis && (
          <section className="panel team-panel">
            <div className="panel-heading">
              <div><h3>{selectedWorkspace.name}</h3><p>Owner: {selectedWorkspace.ownerName ?? selectedWorkspace.ownerEmail ?? 'Unassigned'} · Manage this workspace with full access.</p></div>
              <button className="secondary-button" type="button" onClick={() => void loadWorkspaceDetails(selectedWorkspaceId ?? '')}>Refresh</button>
              <button className="secondary-button" type="button" onClick={() => { setSelectedWorkspaceId(null); setSelectedKpis(null); setSelectedEmails([]) }}>Close</button>
            </div>
            {wsError && <p className="inline-error" role="alert">{wsError}</p>}
            <div className="metric-grid">
              <div className="metric panel"><span>Contacts</span><strong>{selectedKpis.contactsTotal}</strong></div>
              <div className="metric panel"><span>Active</span><strong>{selectedKpis.enrollmentsByState.active ?? 0}</strong></div>
              <div className="metric panel"><span>Reply</span><strong>{selectedKpis.enrollmentsByState.replied ?? 0}</strong></div>
              <div className="metric panel"><span>Interested</span><strong>{selectedKpis.enrollmentsByState.interested ?? 0}</strong></div>
              <div className="metric panel"><span>Sent</span><strong>{selectedKpis.emailsSent}</strong></div>
              <div className="metric panel"><span>Suppressed</span><strong>{selectedKpis.suppressed}</strong></div>
            </div>
            <div className="contact-table-wrap" style={{ marginTop: 16 }}>
              <table className="contact-table"><thead><tr><th>Dir</th><th>From / To</th><th>Subject</th><th>Preview</th><th>Time</th></tr></thead><tbody>{emailsByWorkspace.map(email => (
                <tr key={email.id}>
                  <td><DirectionLabel value={email.direction} /></td>
                  <td>{fromLine(email.participants)}</td>
                  <td><button className="text-action" type="button" onClick={() => void openEmail(email.id)}>{email.subject ?? '(no subject)'}</button></td>
                  <td>{email.snippet ?? ''}</td>
                  <td>{email.receivedAt ? new Date(email.receivedAt).toLocaleString() : (email.sentAt ? new Date(email.sentAt).toLocaleString() : '—')}</td>
                </tr>
              ))}{emailsByWorkspace.length === 0 ? <tr><td colSpan={5} className="table-message">No messages in this workspace yet.</td></tr> : null}</tbody></table>
            </div>
          </section>
        )}
      </>
    )}
    {openEmailId && (
      <CenterDialog open={!!openEmailId} onClose={() => setOpenEmailId(null)} title={openEmailDetail?.subject ?? 'Message'} description="Message body from this workspace.">
        <div className="slideout-form">
          {openEmailLoading ? <div className="table-message">Loading message…</div> : openEmailDetail?.htmlBody ? <iframe sandbox="" referrerPolicy="no-referrer" title="Message body" style={{ width: '100%', minHeight: 480, border: '1px solid var(--line)', background: 'white' }} srcDoc={openEmailDetail?.htmlBody ?? ''} /> : openEmailDetail?.textBody ? <pre className="message-html-body">{openEmailDetail.textBody}</pre> : <p className="table-message">This message has no previewable body.</p>}
          <button className="secondary-button" type="button" onClick={() => setOpenEmailId(null)}>Close</button>
        </div>
      </CenterDialog>
    )}
  </div>
}
