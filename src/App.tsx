import { lazy, Suspense, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { AuthSession } from '@supabase/supabase-js'
import nodeworkLogo from './assets/nodework-logo-mark.png'
import { SignIn } from './components/SignIn'
import {
  Activity, BarChart3, CheckSquare,
  ContactRound, Inbox, Layers3, Mail, Menu, Search, Settings, ShieldCheck,
  Plus, UsersRound, X,
} from 'lucide-react'
import { databaseConfigured, supabase } from './lib/supabase'
import { loadProfile } from './lib/profile'
import type { Profile } from './lib/profile'
import { ProfileAvatar } from './components/ProfileAvatar'
import Typeahead from './components/DataList'

import { CITIES, COUNTRIES, LANGUAGES } from './lib/localeData'
import { companyInput, contactInput, dealInput, taskInput } from './lib/validation'
import { EntityPage, RailCard, SlideOut } from './components/Overlay'
const TeamPanel = lazy(() => import('./components/TeamPanel').then(module => ({ default: module.TeamPanel })))
const InboxPanel = lazy(() => import('./components/InboxPanel').then(module => ({ default: module.InboxPanel })))
const NotesPanel = lazy(() => import('./components/NotesPanel').then(module => ({ default: module.NotesPanel })))
const TemplatesPanel = lazy(() => import('./components/TemplatesPanel').then(module => ({ default: module.TemplatesPanel })))
const AnalyticsPanel = lazy(() => import('./components/AnalyticsPanel').then(module => ({ default: module.AnalyticsPanel })))
const SequencesPanel = lazy(() => import('./components/SequencesPanel').then(module => ({ default: module.SequencesPanel })))
const IntegrationsPanel = lazy(() => import('./components/IntegrationsPanel').then(module => ({ default: module.IntegrationsPanel })))
const SettingsPanel = lazy(() => import('./components/SettingsPanel').then(module => ({ default: module.SettingsPanel })))
const ProspectingPanel = lazy(() => import('./components/ProspectingPanel').then(module => ({ default: module.ProspectingPanel })))
const OverviewPanel = lazy(() => import('./components/OverviewPanel').then(module => ({ default: module.OverviewPanel })))

const sections = [
  { title: 'Workspace', items: [
    ['Overview', BarChart3], ['Inbox', Inbox], ['Contacts', ContactRound], ['Prospecting', Search],
  ] },
  { title: 'Engagement', items: [['Sequences', Layers3], ['Templates', Mail]] },
  { title: 'Sales', items: [['Pipeline', Activity], ['Tasks & Activities', CheckSquare]] },
  { title: 'Insights', items: [['Analytics', BarChart3]] },
  { title: 'Administration', items: [['Integrations', Settings], ['Settings', Settings], ['Team & Audit', ShieldCheck]] },
] as const

// Each sidebar section has one accent colour; the CSS maps data-tone to --tone-* tokens.
const sectionTone: Record<string, string> = {
  Workspace: 'blue', Engagement: 'violet', Sales: 'coral', Insights: 'teal', Administration: 'amber',
}

const descriptions: Record<string, string> = {
  Overview: 'Your sales workspace, activity and next actions.', Inbox: 'Connect a custom-domain mailbox to work with conversations here.',
  Contacts: 'Keep people and companies organized in one place.', 'Prospecting': 'Add people and companies from licensed sources or imports.',
  Sequences: 'Create and manage multi-step sales follow-up.', Campaigns: 'Review audience, sender and schedule before a campaign launch.',
  Templates: 'Create reusable email content with validated personalization.',
  'Sequence Templates': 'Reusable sequence blueprints: all steps, timing and email content.',
  Pipeline: 'Track opportunities through your configured sales stages.',
  'Tasks & Activities': 'Keep follow-ups and customer activity in one place.', Analytics: 'Review sales performance from connected, verified data.',
  Integrations: 'Configure mailbox and external service connections.', Settings: 'Manage workspace preferences and operating rules.',
  'Team & Audit': 'Review team access and sensitive workspace actions.',
}

const implementedPages = new Set(['Overview', 'Inbox', 'Contacts', 'Prospecting', 'Pipeline', 'Tasks & Activities', 'Team & Audit', 'Templates', 'Analytics', 'Sequences', 'Integrations', 'Settings'])

export default function App() {
  const [page, setPage] = useState('Overview')
  const [menuOpen, setMenuOpen] = useState(false)
  const [session, setSession] = useState<AuthSession | null>(null)
  const [authLoading, setAuthLoading] = useState(databaseConfigured)
  const [memberRole, setMemberRole] = useState('')
  const [organizationName, setOrganizationName] = useState('')
  const [profile, setProfile] = useState<Profile | null>(null)

  useEffect(() => {
    if (!session || !supabase) { setProfile(null); return }
    let active = true
    void loadProfile(session.user.id).then(loaded => { if (active) setProfile(loaded) }, () => { if (active) setProfile(null) })
    return () => { active = false }
  }, [session?.user.id])

  useEffect(() => {
    if (!supabase) return
    void supabase.auth.getSession().then(({ data }) => { setSession(data.session); setAuthLoading(false) }).catch(() => setAuthLoading(false))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!session || !supabase) { setMemberRole(''); setOrganizationName(''); return }
    let active = true
    void supabase.from('memberships').select('organization_id,role').eq('user_id', session.user.id).limit(1).maybeSingle().then(async ({ data }) => {
      if (!active) return
      setMemberRole(data?.role ?? '')
      if (data?.organization_id) {
        const organization = await supabase!.from('organizations').select('name').eq('id', data.organization_id).maybeSingle()
        if (active) setOrganizationName(organization.data?.name ?? '')
      }
    }, () => { if (active) { setMemberRole(''); setOrganizationName('') } })
    return () => { active = false }
  }, [session?.user.id])

  useEffect(() => {
    if (!menuOpen) return
    function onKeyDown(event: KeyboardEvent) { if (event.key === 'Escape') setMenuOpen(false) }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])
  if (databaseConfigured && authLoading) return <div className="auth-loading"><img className="auth-logo-dark" src={nodeworkLogo} alt="" aria-hidden="true" /><p>Checking your sign-in session…</p></div>
  if (databaseConfigured && !session) return <SignIn />

  return <div className="app-shell">
    {menuOpen && <button className="scrim" aria-label="Close navigation" onClick={() => setMenuOpen(false)} />}
    <aside id="workspace-sidebar" className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
      <div className="brand"><img className="brand-mark" src={nodeworkLogo} alt="" aria-hidden="true" /><div><strong>EIDEN Reach</strong><span>Sales workspace</span></div><button className="mobile-close" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X size={18} /></button></div>
      <div className="workspace"><span><b>{organizationName || 'Workspace'}</b><small>{memberRole ? memberRole.replaceAll('_', ' ') : 'No workspace membership'}</small></span></div>
      <nav aria-label="Main navigation" className="navigation">{sections.filter(section => section.title !== 'Administration' || ['super_admin', 'sales_manager'].includes(memberRole)).map((section) => <div className="nav-group" key={section.title} data-tone={sectionTone[section.title]}><div className="nav-label">{section.title}</div>{section.items.filter(([label]) => label !== 'Team & Audit' || ['super_admin', 'sales_manager'].includes(memberRole)).map(([label, Icon]) => <button key={label} className={`nav-item ${page === label ? 'active' : ''}`} onClick={() => { setPage(label); setMenuOpen(false) }}><Icon size={17} strokeWidth={1.8} /><span>{label}</span></button>)}</div>)}</nav>
      <div className="sidebar-bottom"><div className="connection"><span className={`connection-dot ${databaseConfigured ? 'ready' : ''}`} />{databaseConfigured ? 'Database configured' : 'Database setup needed'}</div><div className="profile"><ProfileAvatar path={profile?.avatar_path ?? null} label={profile?.display_name || session?.user.email || 'You'} /><span><b>{session?.user.email ?? 'EIDEN user'}</b><small>Signed in</small></span><button aria-label="Sign out" onClick={() => void supabase?.auth.signOut()}><X size={16} /></button></div></div>
    </aside>
    <main className="main-area">
      <header className="topbar"><div className="top-left"><button className="mobile-menu" aria-label="Open navigation" aria-expanded={menuOpen} aria-controls="workspace-sidebar" onClick={() => setMenuOpen(true)}><Menu size={19} /></button><span className="breadcrumb">Workspace <span>/</span> <b>{page}</b></span><span className="top-context"><ShieldCheck size={14} />Tenant-protected workspace</span></div><div className="top-right"><span className="setup-pill"><i /> Workspace online</span><div className="user-menu" aria-label="Current user"><ProfileAvatar path={profile?.avatar_path ?? null} label={profile?.display_name || session?.user.email || 'You'} size="sm" /></div></div></header>
      <section className="content"><div className="page-heading"><div><div className="eyebrow">EIDEN Reach</div><h1>{page}</h1><p>{descriptions[page]}</p></div></div>
<Suspense fallback={<div className="table-message">Loading screen…</div>}>
                {!databaseConfigured && <div className="notice"><div className="notice-icon"><Settings size={18} /></div><div><b>Connect the workspace database to get started</b><p>Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> in your local environment after creating a Supabase project. The browser key is public by design; access must be enforced with database row policies.</p></div></div>}
        {page === 'Inbox' ? session ? <InboxPanel userId={session.user.id} canConnect={['super_admin', 'sales_manager', 'sales_representative'].includes(memberRole)} /> : <div className="inbox-empty panel"><div className="empty-icon"><Inbox size={22} /></div><h2>Sign in to connect a mailbox</h2><p>Mailbox credentials are only handled by a trusted server. No inbox data is shown in setup mode.</p></div> : page === 'Overview' && session ? <OverviewPanel userId={session.user.id} /> : page === 'Contacts' && session ? <PeoplePanel userId={session.user.id} canWrite={['super_admin', 'sales_manager', 'sales_representative'].includes(memberRole)} /> : page === 'Prospecting' && session ? <ProspectingPanel userId={session.user.id} canWrite={['super_admin', 'sales_manager', 'sales_representative'].includes(memberRole)} /> : page === 'Pipeline' && session ? <PipelinePanel userId={session.user.id} canWrite={['super_admin', 'sales_manager', 'sales_representative'].includes(memberRole)} /> : page === 'Tasks & Activities' && session ? <TasksPanel userId={session.user.id} canWrite={['super_admin', 'sales_manager', 'sales_representative'].includes(memberRole)} canManage={['super_admin', 'sales_manager'].includes(memberRole)} /> : page === 'Templates' && session ? <TemplatesPanel userId={session.user.id} canWrite={['super_admin', 'sales_manager', 'sales_representative'].includes(memberRole)} /> : page === 'Analytics' && session ? <AnalyticsPanel userId={session.user.id} /> : page === 'Sequences' && session ? <SequencesPanel userId={session.user.id} canWrite={['super_admin', 'sales_manager', 'sales_representative'].includes(memberRole)} /> : page === 'Integrations' && session ? <IntegrationsPanel userId={session.user.id} /> : page === 'Settings' && session ? <SettingsPanel userId={session.user.id} email={session.user.email ?? ''} profile={profile} onProfileChange={setProfile} canWrite={true} /> : page === 'Team & Audit' && session ? <TeamPanel userId={session.user.id} role={memberRole} /> : <div className="panel empty-panel"><div className="empty-icon"><EmptyIcon page={page} /></div><h2>{!implementedPages.has(page) ? 'Under development' : databaseConfigured ? 'No records yet' : 'Waiting for workspace setup'}</h2><p>{!implementedPages.has(page) ? 'This area is not connected to working product features yet. No sample data or integration status is being shown.' : databaseConfigured ? 'This section will show records from the connected workspace.' : 'Connect authentication and the database to enable this section. No sample business data is shown.'}</p></div>}
        </Suspense>
        <footer className="page-footer"><span>EIDEN Reach · Sales operations</span><span>Tenant-scoped access · audited administrative actions</span></footer>
      </section>
    </main>
  </div>
}


function PeoplePanel({ userId, canWrite }: { userId: string; canWrite: boolean }) {
  const [tab, setTab] = useState<'contacts' | 'companies'>('contacts')
  return <div className="people-page">
    <div className="people-tabs" role="tablist" aria-label="People views">
      <button type="button" role="tab" aria-selected={tab === 'contacts'} className={tab === 'contacts' ? 'tab-active' : ''} onClick={() => setTab('contacts')}>Contacts</button>
      <button type="button" role="tab" aria-selected={tab === 'companies'} className={tab === 'companies' ? 'tab-active' : ''} onClick={() => setTab('companies')}>Companies</button>
    </div>
    {tab === 'contacts' ? <ContactsPanel userId={userId} canWrite={canWrite} /> : <CompaniesPanel userId={userId} canWrite={canWrite} />}
  </div>
}

type Contact = { id: string; first_name: string; last_name: string; email: string | null; job_title: string | null; lifecycle: string; company_id: string | null }
type ContactCompany = { id: string; name: string }
type ContactActivity = { id: string; event_type: string; summary: string; occurred_at: string; source: string | null }
function ContactsPanel({ userId, canWrite }: { userId: string; canWrite: boolean }) {
  const [createOpen, setCreateOpen] = useState(false)
  const [orgId, setOrgId] = useState('')
  const [contacts, setContacts] = useState<Contact[]>([])
  const [companies, setCompanies] = useState<ContactCompany[]>([])
  const [editing, setEditing] = useState<Contact | null>(null)
  const [activity, setActivity] = useState<ContactActivity[]>([])
  const [activityLoading, setActivityLoading] = useState(false)
  const [activityError, setActivityError] = useState('')
  const [activityRefresh, setActivityRefresh] = useState(0)
  const [draft, setDraft] = useState({ firstName: '', lastName: '', email: '', companyId: '', jobTitle: '', lifecycle: 'new' })
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [language, setLanguage] = useState('')
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('')
  const [industry, setIndustry] = useState('')
  const [industryOptions, setIndustryOptions] = useState<string[]>([])
  const [companyId, setCompanyId] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    let active = true
    void (async () => {
      const membership = await supabase!.from('memberships').select('organization_id').eq('user_id', userId).limit(1).maybeSingle()
      if (!active) return
      if (membership.error || !membership.data) { setError('Your account is not assigned to a workspace yet. Ask an administrator to add your membership.'); setLoading(false); return }
      setOrgId(membership.data.organization_id)
      const companyResult = await supabase!.from('companies').select('id,name').eq('organization_id', membership.data.organization_id).is('archived_at', null).order('name').limit(500)
      if (!active) return
      if (!companyResult.error) setCompanies(companyResult.data ?? [])
      if (active) setLoading(false)
    })()
    return () => { active = false }
  }, [userId])
  useEffect(() => {
    if (!orgId) return
    let active = true
    void (async () => {
      const res = await supabase!.from('industry_categories').select('name').eq('organization_id',orgId).is('archived_at', null).order('name')
      if (active) setIndustryOptions((res.data ?? []).map((r: { name: string }) => r.name))
    })()
    return () => { active = false }
  }, [orgId])

  useEffect(() => {
    if (!orgId) return
    let active = true
    setLoading(true)
    const safeSearch = search.trim().replace(/[^A-Za-z0-9\s@.+-]/g, '').trim()
    let query = supabase!.from('contacts').select('id,first_name,last_name,email,job_title,lifecycle,company_id', { count: 'exact' }).eq('organization_id', orgId).is('archived_at', null)
    if (safeSearch) query = query.or(`first_name.ilike.%${safeSearch}%,last_name.ilike.%${safeSearch}%,email.ilike.%${safeSearch}%`)
    void query.order('created_at', { ascending: false }).range(page * 50, page * 50 + 49).then(result => {
      if (!active) return
      if (result.error) setError('Could not load contacts. Check database migrations and workspace permissions.')
      else { setContacts(result.data ?? []); setTotal(result.count ?? 0); setError('') }
      setLoading(false)
    })
    return () => { active = false }
  }, [orgId, search, page])
  useEffect(() => {
    if (!editing || !orgId) { setActivity([]); return }
    let active = true
    setActivity([])
    setActivityError('')
    setActivityLoading(true)
    void supabase!.from('activity_events').select('id,event_type,summary,occurred_at,source').eq('organization_id', orgId).eq('contact_id', editing.id).order('occurred_at', { ascending: false }).limit(50).then(result => {
      if (!active) return
      if (result.error) setActivityError('Contact activity could not be loaded.')
      else setActivity(result.data ?? [])
      setActivityLoading(false)
    })
    return () => { active = false }
  }, [editing?.id, orgId, activityRefresh])
  async function createContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!canWrite || !orgId) return
    setSaving(true); setError('')
    const input = contactInput.safeParse({ firstName, lastName, email })
    if (!input.success) { setError(input.error.issues[0]?.message ?? 'Check contact details.'); setSaving(false); return }
    const result = await supabase!.from('contacts').insert({ organization_id: orgId, first_name: input.data.firstName, last_name: input.data.lastName, email: input.data.email, language: language.trim() || null, city: city.trim() || null, country: country.trim() || null, industry: industry || null, company_id: companyId || null, owner_id: userId, created_by: userId }).select('id,first_name,last_name,email,job_title,lifecycle,company_id').single()
    if (result.error) setError(result.error.code === '23505' ? 'A contact with that email already exists in this workspace.' : 'The contact could not be saved. Check required fields and workspace permissions.')
    else { setContacts(current => [result.data, ...current].slice(0, 50)); setTotal(value => value + 1); setFirstName(''); setLastName(''); setEmail(''); setCompanyId(''); setPage(0); setSearch(''); setCreateOpen(false) }
    setSaving(false)
  }
  function selectContact(contact: Contact) {
    setEditing(contact)
    setDraft({ firstName: contact.first_name, lastName: contact.last_name, email: contact.email ?? '', companyId: contact.company_id ?? '', jobTitle: contact.job_title ?? '', lifecycle: contact.lifecycle })
  }
  async function saveContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canWrite || !editing || !orgId) return
    const parsed = contactInput.safeParse({ firstName: draft.firstName, lastName: draft.lastName, email: draft.email })
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Check contact details.'); return }
    if (draft.jobTitle.trim().length > 200) { setError('Role must be 200 characters or fewer.'); return }
    setSaving(true); setError('')
    const result = await supabase!.from('contacts').update({ first_name: parsed.data.firstName, last_name: parsed.data.lastName, email: parsed.data.email, company_id: draft.companyId || null, job_title: draft.jobTitle.trim() || null, lifecycle: draft.lifecycle }).eq('id', editing.id).eq('organization_id', orgId).select('id,first_name,last_name,email,job_title,lifecycle,company_id').single()
    if (result.error) setError(result.error.code === '23505' ? 'A contact with that email already exists in this workspace.' : 'Contact changes could not be saved. Check workspace permissions.')
    else { setContacts(current => current.map(contact => contact.id === editing.id ? result.data : contact)); setEditing(result.data); setActivityRefresh(value => value + 1) }
    setSaving(false)
  }
  async function archiveContact() {
    if (!canWrite || !editing || !orgId || !window.confirm(`Archive ${editing.first_name} ${editing.last_name}?`)) return
    setSaving(true); setError('')
    const result = await supabase!.from('contacts').update({ archived_at: new Date().toISOString() }).eq('id', editing.id).eq('organization_id', orgId).select('id').single()
    if (result.error) setError('Contact could not be archived. Check workspace permissions.')
    else { setContacts(current => current.filter(contact => contact.id !== editing.id)); setTotal(value => Math.max(0, value - 1)); setPage(current => current > 0 && current * 50 >= total - 1 ? current - 1 : current); setEditing(null) }
    setSaving(false)
  }
  return <section className="panel contacts-panel"><div className="panel-heading"><div><h2>Contacts</h2><p>{total} workspace records · newest first · 50 per page</p></div>{canWrite && <button className="primary-button" type="button" onClick={() => setCreateOpen(true)}><Plus size={15} /> New contact</button>}</div>{error && <p className="inline-error" role="alert">{error}</p>}<SlideOut open={createOpen} onClose={() => setCreateOpen(false)} title="New contact" description="Add a person to this workspace."><form className="contact-form" onSubmit={createContact}><label>First name<input value={firstName} onChange={e => setFirstName(e.target.value)} required maxLength={100} /></label><label>Last name<input value={lastName} onChange={e => setLastName(e.target.value)} maxLength={100} /></label><label>Language<Typeahead value={language} setValue={setLanguage} options={LANGUAGES} placeholder="Language" /></label>
<label>City<Typeahead value={city} setValue={setCity} options={CITIES} placeholder="City" /></label>
<label>Country<Typeahead value={country} setValue={setCountry} options={COUNTRIES} placeholder="Country" /></label>
<label>Industry<select value={industry} onChange={e => setIndustry(e.target.value)}><option value="">No industry</option>{industryOptions.map(o => <option key={o} value={o}>{o}</option>)}</select></label>
<label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} maxLength={320} /></label><label>Company<select value={companyId} onChange={e => setCompanyId(e.target.value)}><option value="">No company</option>{companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label><button className="primary-button" disabled={saving || !orgId}>{saving ? 'Saving…' : 'Add contact'}</button></form></SlideOut><div className="contact-tools"><label>Search contacts<input type="search" value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} placeholder="Name or email" /></label></div><EntityPage open={!!editing} onClose={() => setEditing(null)} kicker="Contacts" title={editing ? `${editing.first_name} ${editing.last_name}`.trim() : ''} sidebar={editing ? <RailCard title="Summary" rows={[['Email', editing.email], ['Company', companies.find(company => company.id === editing.company_id)?.name], ['Role', editing.job_title], ['Lifecycle', editing.lifecycle]]} /> : undefined}>{editing && <section className="contact-editor" aria-label="Contact details"><div className="editor-heading"><div><h3>{editing.first_name} {editing.last_name}</h3><p>Contact record · {editing.lifecycle}</p></div><button className="secondary-button" type="button" onClick={() => setEditing(null)}>Close</button></div>{canWrite ? <form className="contact-form" onSubmit={saveContact}><label>First name<input value={draft.firstName} onChange={e => setDraft({ ...draft, firstName: e.target.value })} required maxLength={100} /></label><label>Last name<input value={draft.lastName} onChange={e => setDraft({ ...draft, lastName: e.target.value })} maxLength={100} /></label><label>Email<input type="email" value={draft.email} onChange={e => setDraft({ ...draft, email: e.target.value })} maxLength={320} /></label><label>Company<select value={draft.companyId} onChange={e => setDraft({ ...draft, companyId: e.target.value })}><option value="">No company</option>{companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label><label>Role<input value={draft.jobTitle} onChange={e => setDraft({ ...draft, jobTitle: e.target.value })} maxLength={200} /></label><label>Lifecycle<select value={draft.lifecycle} onChange={e => setDraft({ ...draft, lifecycle: e.target.value })}>{['new', 'working', 'qualified', 'customer', 'disqualified'].map(status => <option key={status} value={status}>{status.replace('_', ' ')}</option>)}</select></label><button className="primary-button" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</button><button className="archive-button" type="button" disabled={saving} onClick={() => void archiveContact()}>Archive contact</button></form> : <dl className="contact-readonly"><dt>Email</dt><dd>{editing.email ?? 'Not set'}</dd><dt>Company</dt><dd>{companies.find(company => company.id === editing.company_id)?.name ?? 'Not set'}</dd><dt>Role</dt><dd>{editing.job_title ?? 'Not set'}</dd><dt>Lifecycle</dt><dd>{editing.lifecycle}</dd></dl>}</section>}{editing && <section className="activity-timeline" aria-label="Contact activity"><h4>Activity</h4>{activityLoading ? <p>Loading activity...</p> : activityError ? <p role="alert">{activityError}</p> : activity.length ? <ol>{activity.map(event => <li key={event.id}><div><b>{event.summary}</b><time dateTime={event.occurred_at}>{new Date(event.occurred_at).toLocaleString()}</time></div><small>{event.event_type.replace("contact.", "").replace(".", " ")}</small></li>)}</ol> : <p>No activity has been recorded for this contact.</p>}</section>}
{editing && orgId && <NotesPanel organizationId={orgId} userId={userId} canWrite={canWrite} entityType="contact" entityId={editing.id} />}</EntityPage>{loading ? <div className="table-message">Loading contacts…</div> : contacts.length ? <><div className="contact-table-wrap"><table className="contact-table"><thead><tr><th>Name</th><th>Email</th><th>Company</th><th>Role</th><th>Lifecycle</th></tr></thead><tbody>{contacts.map(contact => <tr key={contact.id}><td><button className="text-action" onClick={() => selectContact(contact)}>{contact.first_name} {contact.last_name}</button></td><td>{contact.email || '—'}</td><td>{companies.find(company => company.id === contact.company_id)?.name ?? '—'}</td><td>{contact.job_title || '—'}</td><td>{contact.lifecycle}</td></tr>)}</tbody></table></div><div className="contact-pagination"><span>Showing {page * 50 + 1}–{Math.min((page + 1) * 50, total)} of {total}</span><div><button className="secondary-button" disabled={page === 0} onClick={() => setPage(value => value - 1)}>Previous</button><button className="secondary-button" disabled={(page + 1) * 50 >= total} onClick={() => setPage(value => value + 1)}>Next</button></div></div></> : !error && <div className="table-message">{search ? 'No contacts match this search.' : `No contacts yet. ${canWrite ? 'Add a contact above to start your CRM.' : 'No contact records are available.'}`}</div>}</section>
}

type Company = { id: string; name: string; domain: string | null; industry: string | null; location: string | null; employee_count: number | null }
function CompaniesPanel({ userId, canWrite }: { userId: string; canWrite: boolean }) {
  const [createOpen, setCreateOpen] = useState(false)
  const [orgId, setOrgId] = useState('')
  const [companies, setCompanies] = useState<Company[]>([])
  const [editing, setEditing] = useState<Company | null>(null)
  const [draft, setDraft] = useState({ name: '', domain: '', industry: '', location: '', employeeCount: '' })
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(0)
  const [total, setTotal] = useState(0)
  const [name, setName] = useState('')
  const [domain, setDomain] = useState('')
  const [industry, setIndustry] = useState('')
  const [industryOptions, setIndustryOptions] = useState<string[]>([])
  const [location, setLocation] = useState('')
  const [employeeCount, setEmployeeCount] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  useEffect(() => { void (async () => {
    const member = await supabase!.from('memberships').select('organization_id').eq('user_id', userId).limit(1).maybeSingle()
    if (!member.data) { setError('Your account is not assigned to a workspace yet.'); setLoading(false); return }
    setOrgId(member.data.organization_id)
    const ires = await supabase!.from('industry_categories').select('name').eq('organization_id', member.data.organization_id).is('archived_at', null).order('name')
    if (!ires.error) setIndustryOptions((ires.data ?? []).map((r: { name: string }) => r.name))
  })() }, [userId])
  useEffect(() => {
    if (!orgId) return
    let active = true
    setLoading(true)
    const safeSearch = search.trim().replace(/[^A-Za-z0-9\s@.+-]/g, '').trim()
    let query = supabase!.from('companies').select('id,name,domain,industry,location,employee_count', { count: 'exact' }).eq('organization_id', orgId).is('archived_at', null)
    if (safeSearch) query = query.or(`name.ilike.%${safeSearch}%,domain.ilike.%${safeSearch}%`)
    void query.order('name').range(page * 50, page * 50 + 49).then(response => {
      if (!active) return
      if (response.error) setError('Could not load companies. Check your database migrations and workspace permissions.')
      else { setCompanies(response.data ?? []); setTotal(response.count ?? 0); setError('') }
      setLoading(false)
    })
    return () => { active = false }
  }, [orgId, search, page])
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!canWrite) return; setError('')
    const input = companyInput.safeParse({ name, domain, industry, location, employeeCount })
    if (!input.success) { setError(input.error.issues[0]?.message ?? 'Check company details.'); return }
    setSaving(true)
    const response = await supabase!.from('companies').insert({ organization_id: orgId, name: input.data.name, domain: input.data.domain, industry: input.data.industry, location: input.data.location, employee_count: input.data.employeeCount, owner_id: userId, created_by: userId }).select('id,name,domain,industry,location,employee_count').single()
    if (response.error) setError(response.error.code === '23505' ? 'A company with that domain already exists.' : 'Company could not be saved. Check workspace permissions.')
    else { setCompanies(current => [...current, response.data].sort((a, b) => a.name.localeCompare(b.name)).slice(0, 50)); setTotal(value => value + 1); setName(''); setDomain(''); setIndustry(''); setLocation(''); setEmployeeCount(''); setPage(0); setSearch(''); setCreateOpen(false) }
    setSaving(false)
  }
  function selectCompany(company: Company) { setEditing(company); setDraft({ name: company.name, domain: company.domain ?? '', industry: company.industry ?? '', location: company.location ?? '', employeeCount: company.employee_count?.toString() ?? '' }) }
  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!canWrite || !editing || !orgId) return
    const input = companyInput.safeParse(draft)
    if (!input.success) { setError(input.error.issues[0]?.message ?? 'Check company details.'); return }
    setSaving(true); setError('')
    const response = await supabase!.from('companies').update({ name: input.data.name, domain: input.data.domain, industry: input.data.industry, location: input.data.location, employee_count: input.data.employeeCount }).eq('id', editing.id).eq('organization_id', orgId).select('id,name,domain,industry,location,employee_count').single()
    if (response.error) setError(response.error.code === '23505' ? 'A company with that domain already exists.' : 'Company changes could not be saved. Check workspace permissions.')
    else { setCompanies(current => current.map(company => company.id === editing.id ? response.data : company).sort((a, b) => a.name.localeCompare(b.name))); setEditing(response.data); setSearch(''); setPage(0) }
    setSaving(false)
  }
  async function archive() {
    if (!canWrite || !editing || !orgId || !window.confirm(`Archive ${editing.name}?`)) return
    setSaving(true); setError('')
    const response = await supabase!.from('companies').update({ archived_at: new Date().toISOString() }).eq('id', editing.id).eq('organization_id', orgId).select('id').single()
    if (response.error) setError('Company could not be archived. Check workspace permissions.')
    else { setCompanies(current => current.filter(company => company.id !== editing.id)); setTotal(value => Math.max(0, value - 1)); setPage(current => current > 0 && current * 50 >= total - 1 ? current - 1 : current); setEditing(null) }
    setSaving(false)
  }
  return <section className="panel contacts-panel"><div className="panel-heading"><div><h2>Companies</h2><p>{total} workspace companies · alphabetical · 50 per page</p></div>{canWrite && <button className="primary-button" type="button" onClick={() => setCreateOpen(true)}><Plus size={15} /> New company</button>}</div>{error && <p className="inline-error" role="alert">{error}</p>}<SlideOut open={createOpen} onClose={() => setCreateOpen(false)} title="New company" description="Add an organization to this workspace."><form className="contact-form" onSubmit={create}><label>Company name<input value={name} onChange={e => setName(e.target.value)} required maxLength={200} /></label><label>Domain<input value={domain} onChange={e => setDomain(e.target.value)} placeholder="example.com" maxLength={253} /></label><label>Industry<select value={industry} onChange={e => setIndustry(e.target.value)}><option value="">Select one (defined in Settings)</option>{industryOptions.map(ic => <option key={ic} value={ic}>{ic}</option>)}</select></label><label>Location<input value={location} onChange={e => setLocation(e.target.value)} maxLength={160} /></label><label>Employee count<input inputMode="numeric" value={employeeCount} onChange={e => setEmployeeCount(e.target.value)} maxLength={9} /></label><button className="primary-button" disabled={saving || !orgId}>{saving ? 'Saving...' : 'Add company'}</button></form></SlideOut><div className="contact-tools"><label>Search companies<input type="search" value={search} onChange={e => { setSearch(e.target.value); setPage(0) }} placeholder="Company or domain" /></label></div><EntityPage open={!!editing} onClose={() => setEditing(null)} kicker="Companies" title={editing?.name ?? ''} sidebar={editing ? <RailCard title="Summary" rows={[['Domain', editing.domain], ['Industry', editing.industry], ['Location', editing.location], ['Employees', editing.employee_count]]} /> : undefined}>{editing && <section className="contact-editor" aria-label="Company details"><div className="editor-heading"><div><h3>{editing.name}</h3><p>Company record</p></div><button className="secondary-button" type="button" onClick={() => setEditing(null)}>Close</button></div>{canWrite ? <form className="contact-form" onSubmit={update}><label>Company name<input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} required maxLength={200} /></label><label>Domain<input value={draft.domain} onChange={e => setDraft({ ...draft, domain: e.target.value })} maxLength={253} /></label><label>Industry<select value={draft.industry} onChange={e => setDraft({ ...draft, industry: e.target.value })}><option value="">No industry</option>{industryOptions.map(ic => <option key={ic} value={ic}>{ic}</option>)}</select></label><label>Location<input value={draft.location} onChange={e => setDraft({ ...draft, location: e.target.value })} maxLength={160} /></label><label>Employee count<input inputMode="numeric" value={draft.employeeCount} onChange={e => setDraft({ ...draft, employeeCount: e.target.value })} maxLength={9} /></label><button className="primary-button" disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</button><button className="archive-button" type="button" disabled={saving} onClick={() => void archive()}>Archive company</button></form> : <dl className="contact-readonly"><dt>Domain</dt><dd>{editing.domain ?? 'Not set'}</dd><dt>Industry</dt><dd>{editing.industry ?? 'Not set'}</dd><dt>Location</dt><dd>{editing.location ?? 'Not set'}</dd><dt>Employees</dt><dd>{editing.employee_count ?? 'Not set'}</dd></dl>}</section>}
{editing && orgId && <NotesPanel organizationId={orgId} userId={userId} canWrite={canWrite} entityType="company" entityId={editing.id} />}</EntityPage>{loading ? <div className="table-message">Loading companies...</div> : companies.length ? <><div className="contact-table-wrap"><table className="contact-table"><thead><tr><th>Company</th><th>Domain</th><th>Industry</th><th>Location</th><th>Employees</th></tr></thead><tbody>{companies.map(row => <tr key={row.id}><td><button className="text-action" onClick={() => selectCompany(row)}>{row.name}</button></td><td>{row.domain ?? '—'}</td><td>{row.industry ?? '—'}</td><td>{row.location ?? '—'}</td><td>{row.employee_count ?? '—'}</td></tr>)}</tbody></table></div><div className="contact-pagination"><span>Showing {page * 50 + 1}–{Math.min((page + 1) * 50, total)} of {total}</span><div><button className="secondary-button" disabled={page === 0} onClick={() => setPage(value => value - 1)}>Previous</button><button className="secondary-button" disabled={(page + 1) * 50 >= total} onClick={() => setPage(value => value + 1)}>Next</button></div></div></> : !error && <div className="table-message">{search ? 'No companies match this search.' : `No companies yet. ${canWrite ? 'Add a company above.' : 'No company records are available.'}`}</div>}</section>
}

type Task = { id: string; title: string; due_at: string | null; status: 'open' | 'in_progress' | 'completed' | 'cancelled'; priority: number; owner_id: string | null; contact_id: string | null; company_id: string | null; deal_id: string | null }
function TasksPanel({ userId, canWrite, canManage }: { userId: string; canWrite: boolean; canManage: boolean }) {
  const [createOpen, setCreateOpen] = useState(false)
  const [orgId, setOrgId] = useState('')
  const [tasks, setTasks] = useState<Task[]>([])
  const [contacts, setContacts] = useState<PipelineContact[]>([])
  const [companies, setCompanies] = useState<ContactCompany[]>([])
  const [deals, setDeals] = useState<{ id: string; name: string }[]>([])
  const [title, setTitle] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [contactId, setContactId] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [dealId, setDealId] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  useEffect(() => { void (async () => {
    const member = await supabase!.from('memberships').select('organization_id').eq('user_id', userId).limit(1).maybeSingle()
    if (!member.data) { setError('Your account is not assigned to a workspace yet.'); setLoading(false); return }
    setOrgId(member.data.organization_id)
    let taskQuery = supabase!.from('tasks').select('id,title,due_at,status,priority,owner_id,contact_id,company_id,deal_id').eq('organization_id', member.data.organization_id)
    if (!canManage) taskQuery = taskQuery.eq('owner_id', userId)
    const [response, contactResponse, companyResponse, dealResponse] = await Promise.all([
      taskQuery.order('due_at', { ascending: true, nullsFirst: false }).limit(100),
      supabase!.from('contacts').select('id,first_name,last_name,company_id').eq('organization_id', member.data.organization_id).is('archived_at', null).order('first_name').limit(500),
      supabase!.from('companies').select('id,name').eq('organization_id', member.data.organization_id).is('archived_at', null).order('name').limit(500),
      supabase!.from('deals').select('id,name').eq('organization_id', member.data.organization_id).is('archived_at', null).order('name').limit(500),
    ])
    if (response.error || contactResponse.error || companyResponse.error || dealResponse.error) setError('Could not load tasks and related records. Check your database migrations and workspace permissions.')
    else { setTasks(response.data ?? []); setContacts(contactResponse.data ?? []); setCompanies(companyResponse.data ?? []); setDeals(dealResponse.data ?? []) }
    setLoading(false)
  })() }, [userId, canManage])
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!canWrite) return; setError('')
    const input = taskInput.safeParse({ title, dueAt: dueAt ? new Date(dueAt).toISOString() : '' })
    if (!input.success) { setError(input.error.issues[0]?.message ?? 'Check task details.'); return }
    setSaving(true)
    const response = await supabase!.from('tasks').insert({ organization_id: orgId, title: input.data.title, due_at: input.data.dueAt, contact_id: contactId || null, company_id: companyId || null, deal_id: dealId || null, owner_id: userId, created_by: userId }).select('id,title,due_at,status,priority,owner_id,contact_id,company_id,deal_id').single()
    if (response.error) setError('Task could not be saved. Check workspace permissions.')
    else { setTasks(current => [...current, response.data].sort((a,b) => (a.due_at ?? '9999').localeCompare(b.due_at ?? '9999'))); setTitle(''); setDueAt(''); setContactId(''); setCompanyId(''); setDealId(''); setCreateOpen(false) }
    setSaving(false)
  }
  async function complete(task: Task) {
    if (!canWrite || (!canManage && task.owner_id !== userId)) return
    setError('')
    const response = await supabase!.from('tasks').update({ status: 'completed', completed_at: new Date().toISOString() }).eq('id', task.id).eq('organization_id', orgId)
    if (response.error) setError('Task could not be updated. Only the owner or a manager can complete it.')
    else setTasks(current => current.map(item => item.id === task.id ? { ...item, status: 'completed' } : item))
  }
  return <section className="panel contacts-panel"><div className="panel-heading"><div><h2>Tasks & Activities</h2><p>Your assigned follow-ups</p></div>{canWrite && <button className="primary-button" type="button" onClick={() => setCreateOpen(true)}><Plus size={15} /> New task</button>}</div>{error && <p className="inline-error" role="alert">{error}</p>}<SlideOut open={createOpen} onClose={() => setCreateOpen(false)} title="New task" description="Add a follow-up and link it to a record."><form className="contact-form" onSubmit={create}><label>Task title<input value={title} onChange={e => setTitle(e.target.value)} required maxLength={200} /></label><label>Due date<input type="datetime-local" value={dueAt} onChange={e => setDueAt(e.target.value)} /></label><label>Contact<select value={contactId} onChange={e => setContactId(e.target.value)}><option value="">No contact</option>{contacts.map(contact => <option key={contact.id} value={contact.id}>{contact.first_name} {contact.last_name}</option>)}</select></label><label>Company<select value={companyId} onChange={e => setCompanyId(e.target.value)}><option value="">No company</option>{companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label><label>Deal<select value={dealId} onChange={e => setDealId(e.target.value)}><option value="">No deal</option>{deals.map(deal => <option key={deal.id} value={deal.id}>{deal.name}</option>)}</select></label><button className="primary-button" disabled={saving || !orgId}>{saving ? 'Saving...' : 'Add task'}</button></form></SlideOut>{loading ? <div className="table-message">Loading tasks...</div> : tasks.length ? <div className="contact-table-wrap"><table className="contact-table"><thead><tr><th>Task</th><th>Related records</th><th>Due</th><th>Status</th><th>Action</th></tr></thead><tbody>{tasks.map(task => { const person = contacts.find(contact => contact.id === task.contact_id); const company = companies.find(item => item.id === task.company_id); const deal = deals.find(item => item.id === task.deal_id); const related = [person ? `${person.first_name} ${person.last_name}` : '', company?.name ?? '', deal?.name ?? ''].filter(Boolean).join(' · '); return <tr key={task.id}><td>{task.title}</td><td>{related || 'Not linked'}</td><td>{task.due_at ? new Date(task.due_at).toLocaleString() : 'No due date'}</td><td>{task.status.replace('_', ' ')}</td><td>{canWrite && task.status !== 'completed' && (canManage || task.owner_id === userId) && <button className="text-action" onClick={() => void complete(task)}>Complete</button>}</td></tr> })}</tbody></table></div> : !error && <div className="table-message">No tasks yet. {canWrite ? 'Add your next follow-up above.' : 'No follow-ups are available.'}</div>}</section>
}

type Deal = { id: string; name: string; amount: number | null; currency: string; stage_id: string; status: string; expected_close_on: string | null; company_id: string | null; primary_contact_id: string | null; next_action: string | null; lost_reason: string | null; owner_id: string | null }
type PipelineStage = { id: string; name: string; position: number; probability: number; is_won: boolean; is_lost: boolean }
type PipelineContact = { id: string; first_name: string; last_name: string; company_id: string | null }
type DealStageHistory = { id: string; from_stage_id: string | null; to_stage_id: string; changed_at: string; note: string | null }
function forecastByCurrency(deals: Deal[], stage: PipelineStage) {
  const totals = new Map<string, number>()
  for (const deal of deals) {
    if (deal.stage_id !== stage.id || deal.amount == null) continue
    totals.set(deal.currency, (totals.get(deal.currency) ?? 0) + Number(deal.amount) * Number(stage.probability))
  }
  return [...totals.entries()].map(([currency, value]) => new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: 0 }).format(value))
}
function PipelinePanel({ userId, canWrite }: { userId: string; canWrite: boolean }) {
  const [createOpen, setCreateOpen] = useState(false)
  const [orgId, setOrgId] = useState('')
  const [pipelineId, setPipelineId] = useState('')
  const [stages, setStages] = useState<PipelineStage[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [companies, setCompanies] = useState<ContactCompany[]>([])
  const [contacts, setContacts] = useState<PipelineContact[]>([])
  const [editingDeal, setEditingDeal] = useState<Deal | null>(null)
  const [history, setHistory] = useState<DealStageHistory[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historyRefresh, setHistoryRefresh] = useState(0)
  const [dealDraft, setDealDraft] = useState({ name: '', amount: '', currency: 'USD', companyId: '', contactId: '', expectedCloseOn: '', nextAction: '' })
  const [name, setName] = useState('')
  const [amount, setAmount] = useState('')
  const [nextAction, setNextAction] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [contactId, setContactId] = useState('')
  const [closeDate, setCloseDate] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  useEffect(() => { void (async () => {
    const member = await supabase!.from('memberships').select('organization_id').eq('user_id', userId).limit(1).maybeSingle()
    if (!member.data) { setError('Your account is not assigned to a workspace yet.'); setLoading(false); return }
    setOrgId(member.data.organization_id)
    const pipe = await supabase!.from('pipelines').select('id').eq('organization_id', member.data.organization_id).eq('is_default', true).maybeSingle()
    if (!pipe.data) { setError('No pipeline is configured for this workspace. Ask an administrator to check its setup.'); setLoading(false); return }
    setPipelineId(pipe.data.id)
    const [stageResponse, dealResponse, companyResponse, contactResponse] = await Promise.all([
      supabase!.from('pipeline_stages').select('id,name,position,probability,is_won,is_lost').eq('pipeline_id', pipe.data.id).order('position'),
      supabase!.from('deals').select('id,name,amount,currency,stage_id,status,expected_close_on,company_id,primary_contact_id,next_action,lost_reason,owner_id').eq('organization_id', member.data.organization_id).eq('pipeline_id', pipe.data.id).is('archived_at', null).order('created_at', { ascending: false }).limit(100),
      supabase!.from('companies').select('id,name').eq('organization_id', member.data.organization_id).is('archived_at', null).order('name').limit(500),
      supabase!.from('contacts').select('id,first_name,last_name,company_id').eq('organization_id', member.data.organization_id).is('archived_at', null).order('first_name').limit(500),
    ])
    if (stageResponse.error || dealResponse.error || companyResponse.error || contactResponse.error) setError('Could not load pipeline records. Check your database migrations and workspace permissions.')
    else { setStages(stageResponse.data ?? []); setDeals(dealResponse.data ?? []); setCompanies(companyResponse.data ?? []); setContacts(contactResponse.data ?? []) }
    setLoading(false)
  })() }, [userId])
  useEffect(() => {
    if (!editingDeal || !orgId) { setHistory([]); return }
    let active = true
    setHistoryLoading(true)
    setHistory([])
    void supabase!.from('deal_stage_history').select('id,from_stage_id,to_stage_id,changed_at,note').eq('deal_id', editingDeal.id).order('changed_at', { ascending: false }).limit(50).then(result => {
      if (!active) return
      if (result.error) setError('Deal stage history could not be loaded.')
      else setHistory(result.data ?? [])
      setHistoryLoading(false)
    })
    return () => { active = false }
  }, [editingDeal?.id, orgId, historyRefresh])
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!canWrite) return; setError('')
    const input = dealInput.safeParse({ name, amount, currency: 'USD', expectedCloseOn: closeDate, nextAction })
    if (!input.success) { setError(input.error.issues[0]?.message ?? 'Check opportunity details.'); return }
    const stage = stages.find(item => item.position === 0)
    if (!stage) { setError('Pipeline has no starting stage. Ask an administrator to configure it.'); return }
    setSaving(true)
    const response = await supabase!.from('deals').insert({ organization_id: orgId, pipeline_id: pipelineId, stage_id: stage.id, name: input.data.name, amount: input.data.amount, currency: input.data.currency, company_id: companyId || null, primary_contact_id: contactId || null, expected_close_on: input.data.expectedCloseOn, next_action: input.data.nextAction, owner_id: userId, created_by: userId }).select('id,name,amount,currency,stage_id,status,expected_close_on,company_id,primary_contact_id,next_action,lost_reason,owner_id').single()
    if (response.error) setError('Opportunity could not be saved. Check workspace permissions.')
    else { setDeals(current => [response.data, ...current]); setName(''); setAmount(''); setCompanyId(''); setContactId(''); setCloseDate(''); setNextAction(''); setCreateOpen(false) }
    setSaving(false)
  }
  async function changeStage(deal: Deal, stageId: string) {
    if (!canWrite) return
    const stage = stages.find(item => item.id === stageId)
    let reason: string | null = null
    if (stage?.is_lost) { reason = window.prompt('Enter a reason for marking this deal lost:')?.trim() ?? null; if (!reason) return }
    setError('')
    setSaving(true)
    const response = await supabase!.rpc('move_deal_stage', { target_deal: deal.id, target_stage: stageId, reason })
    if (response.error) setError('Stage change failed. Check that the stage belongs to this pipeline and a lost reason is provided.')
    else {
      const updated = { ...deal, stage_id: stageId, status: stage?.is_lost ? 'lost' : stage?.is_won ? 'won' : 'open', lost_reason: stage?.is_lost ? reason : null }
      setDeals(current => current.map(item => item.id === deal.id ? updated : item))
      setEditingDeal(current => current?.id === deal.id ? updated : current)
      setHistoryRefresh(value => value + 1)
    }
    setSaving(false)
  }
  function selectDeal(deal: Deal) {
    setEditingDeal(deal)
    setDealDraft({ name: deal.name, amount: deal.amount?.toString() ?? '', currency: deal.currency, companyId: deal.company_id ?? '', contactId: deal.primary_contact_id ?? '', expectedCloseOn: deal.expected_close_on ?? '', nextAction: deal.next_action ?? '' })
  }
  async function saveDeal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canWrite || !editingDeal || !orgId) return
    const input = dealInput.safeParse({ name: dealDraft.name, amount: dealDraft.amount, currency: dealDraft.currency, expectedCloseOn: dealDraft.expectedCloseOn, nextAction: dealDraft.nextAction })
    if (!input.success) { setError(input.error.issues[0]?.message ?? 'Check opportunity details.'); return }
    if (dealDraft.companyId && dealDraft.contactId && contacts.find(contact => contact.id === dealDraft.contactId)?.company_id !== dealDraft.companyId) {
      setError('Choose a primary contact from the selected company, or clear one of those associations.'); return
    }
    setSaving(true); setError('')
    const response = await supabase!.from('deals').update({ name: input.data.name, amount: input.data.amount, currency: input.data.currency, company_id: dealDraft.companyId || null, primary_contact_id: dealDraft.contactId || null, expected_close_on: input.data.expectedCloseOn, next_action: input.data.nextAction }).eq('id', editingDeal.id).eq('organization_id', orgId).select('id,name,amount,currency,stage_id,status,expected_close_on,company_id,primary_contact_id,next_action,lost_reason,owner_id').single()
    if (response.error) setError('Opportunity changes could not be saved. Check workspace permissions and linked records.')
    else { setDeals(current => current.map(item => item.id === editingDeal.id ? response.data : item)); setEditingDeal(response.data) }
    setSaving(false)
  }
  async function archiveDeal() {
    if (!canWrite || !editingDeal || !orgId || !window.confirm(`Archive ${editingDeal.name}?`)) return
    setSaving(true); setError('')
    const response = await supabase!.from('deals').update({ archived_at: new Date().toISOString() }).eq('id', editingDeal.id).eq('organization_id', orgId).select('id').single()
    if (response.error) setError('Opportunity could not be archived. Check workspace permissions.')
    else { setDeals(current => current.filter(item => item.id !== editingDeal.id)); setEditingDeal(null) }
    setSaving(false)
  }
  return <section className="panel contacts-panel"><div className="panel-heading"><div><h2>Sales pipeline</h2><p>Stages and weighted forecast use administrator-configured probabilities</p></div>{canWrite && <button className="primary-button" type="button" onClick={() => setCreateOpen(true)}><Plus size={15} /> New opportunity</button>}</div>{error && <p className="inline-error" role="alert">{error}</p>}<SlideOut open={createOpen} onClose={() => setCreateOpen(false)} title="New opportunity" description="Track a potential sale through your pipeline."><form className="contact-form" onSubmit={create}><label>Opportunity name<input value={name} onChange={e => setName(e.target.value)} required maxLength={200} /></label><label>Amount (USD)<input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Optional" /></label><label>Company<select value={companyId} onChange={e => { setCompanyId(e.target.value); setContactId('') }}><option value="">No company</option>{companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label><label>Primary contact<select value={contactId} onChange={e => { const selected = contacts.find(contact => contact.id === e.target.value); setContactId(e.target.value); if (!companyId && selected?.company_id) setCompanyId(selected.company_id) }}><option value="">No contact</option>{contacts.filter(contact => !companyId || contact.company_id === companyId).map(contact => <option value={contact.id} key={contact.id}>{contact.first_name} {contact.last_name}</option>)}</select></label><label>Expected close<input type="date" value={closeDate} onChange={e => setCloseDate(e.target.value)} /></label><label>Next action<input value={nextAction} onChange={e => setNextAction(e.target.value)} maxLength={200} placeholder="Optional follow-up" /></label><button className="primary-button" disabled={saving || !pipelineId}>{saving ? 'Saving...' : 'Add opportunity'}</button></form></SlideOut><EntityPage open={!!editingDeal} onClose={() => setEditingDeal(null)} kicker="Pipeline" title={editingDeal?.name ?? ''} sidebar={editingDeal ? <RailCard title="Summary" rows={[['Value', editingDeal.amount == null ? null : `${editingDeal.amount} ${editingDeal.currency}`], ['Status', editingDeal.status], ['Stage', stages.find(stage => stage.id === editingDeal.stage_id)?.name], ['Expected close', editingDeal.expected_close_on], ['Next action', editingDeal.next_action]]} /> : undefined}>{editingDeal && <section className="contact-editor" aria-label="Opportunity details"><div className="editor-heading"><div><h3>{editingDeal.name}</h3><p>{stages.find(stage => stage.id === editingDeal.stage_id)?.name ?? 'Stage unavailable'} · {editingDeal.status}</p></div><button className="secondary-button" type="button" onClick={() => setEditingDeal(null)}>Close</button></div>{canWrite ? <form className="contact-form" onSubmit={saveDeal}><label>Opportunity name<input value={dealDraft.name} onChange={e => setDealDraft({ ...dealDraft, name: e.target.value })} required maxLength={200} /></label><label>Amount<input inputMode="decimal" value={dealDraft.amount} onChange={e => setDealDraft({ ...dealDraft, amount: e.target.value })} /></label><label>Currency<input value={dealDraft.currency} onChange={e => setDealDraft({ ...dealDraft, currency: e.target.value.toUpperCase() })} maxLength={3} /></label><label>Company<select value={dealDraft.companyId} onChange={e => setDealDraft({ ...dealDraft, companyId: e.target.value, contactId: '' })}><option value="">No company</option>{companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label><label>Primary contact<select value={dealDraft.contactId} onChange={e => { const selected = contacts.find(contact => contact.id === e.target.value); setDealDraft({ ...dealDraft, contactId: e.target.value, companyId: dealDraft.companyId || selected?.company_id || "" }) }}><option value="">No contact</option>{contacts.filter(contact => !dealDraft.companyId || contact.company_id === dealDraft.companyId).map(contact => <option value={contact.id} key={contact.id}>{contact.first_name} {contact.last_name}</option>)}</select></label><label>Expected close<input type="date" value={dealDraft.expectedCloseOn} onChange={e => setDealDraft({ ...dealDraft, expectedCloseOn: e.target.value })} /></label><label>Next action<input value={dealDraft.nextAction} onChange={e => setDealDraft({ ...dealDraft, nextAction: e.target.value })} maxLength={200} /></label><button className="primary-button" disabled={saving}>{saving ? 'Saving...' : 'Save opportunity'}</button><button className="archive-button" type="button" disabled={saving} onClick={() => void archiveDeal()}>Archive opportunity</button></form> : <dl className="contact-readonly"><dt>Company</dt><dd>{companies.find(company => company.id === editingDeal.company_id)?.name ?? 'Not linked'}</dd><dt>Primary contact</dt><dd>{contacts.find(contact => contact.id === editingDeal.primary_contact_id)?.first_name ?? 'Not linked'}{contacts.find(contact => contact.id === editingDeal.primary_contact_id) ? ` ${contacts.find(contact => contact.id === editingDeal.primary_contact_id)?.last_name ?? ''}` : ''}</dd><dt>Expected close</dt><dd>{editingDeal.expected_close_on ?? 'Not set'}</dd><dt>Next action</dt><dd>{editingDeal.next_action ?? 'Not set'}</dd><dt>Lost reason</dt><dd>{editingDeal.lost_reason ?? 'Not applicable'}</dd><dt>Owner</dt><dd>{editingDeal.owner_id === userId ? 'You' : editingDeal.owner_id ?? 'Unassigned'}</dd></dl>}<div className="activity-timeline"><h4>Stage history</h4>{historyLoading ? <p>Loading stage history...</p> : history.length ? <ol>{history.map(item => <li key={item.id}><div><b>{item.from_stage_id ? stages.find(stage => stage.id === item.from_stage_id)?.name ?? 'Previous stage' : 'Created'} → {stages.find(stage => stage.id === item.to_stage_id)?.name ?? 'Stage'}</b><time dateTime={item.changed_at}>{new Date(item.changed_at).toLocaleString()}</time></div>{item.note && <small>{item.note}</small>}</li>)}</ol> : <p>No stage history is available.</p>}</div></section>}{editingDeal && orgId && <NotesPanel organizationId={orgId} userId={userId} canWrite={canWrite} entityType="deal" entityId={editingDeal.id} />}</EntityPage>
{loading ? <div className="table-message">Loading pipeline...</div> : <div className="kanban-scroll">{stages.map(stage => <div className="kanban-column" key={stage.id} onDragOver={event => { if (canWrite) event.preventDefault() }} onDrop={event => { event.preventDefault(); const dealId = event.dataTransfer.getData('text/deal-id'); const dropped = deals.find(item => item.id === dealId); if (canWrite && dropped && dropped.stage_id !== stage.id) void changeStage(dropped, stage.id) }}><div className="kanban-title"><b>{stage.name}</b><span>{deals.filter(deal => deal.stage_id === stage.id).length}</span></div><small>Weighted forecast: {forecastByCurrency(deals, stage).join(' · ') || 'No valued opportunities'}</small>{deals.filter(deal => deal.stage_id === stage.id).map(deal => <article className="deal-card" key={deal.id} draggable={canWrite && !saving} onDragStart={event => { event.dataTransfer.setData('text/deal-id', deal.id); event.dataTransfer.effectAllowed = 'move' }}><button className="text-action deal-title" onClick={() => selectDeal(deal)}>{deal.name}</button><strong>{deal.amount == null ? 'Value not set' : new Intl.NumberFormat('en-US', { style: 'currency', currency: deal.currency }).format(deal.amount)}</strong><small>{companies.find(company => company.id === deal.company_id)?.name ?? 'Company not linked'}</small><small>{contacts.find(contact => contact.id === deal.primary_contact_id)?.first_name ?? 'Contact not linked'}{contacts.find(contact => contact.id === deal.primary_contact_id) ? ` ${contacts.find(contact => contact.id === deal.primary_contact_id)?.last_name ?? ''}` : ''}</small><small>{deal.expected_close_on ? `Close ${deal.expected_close_on}` : 'Close date not set'}</small><small>{deal.next_action ? `Next: ${deal.next_action}` : 'Next action not set'}</small><button className="text-action deal-title" onClick={() => selectDeal(deal)}>View details</button><select aria-label={`Move ${deal.name} to a stage`} disabled={!canWrite || saving} value={deal.stage_id} onChange={event => void changeStage(deal, event.target.value)}>{stages.map(option => <option value={option.id} key={option.id}>{option.name}</option>)}</select></article>)}</div>)}</div>}</section>
}

function EmptyIcon({ page }: { page: string }) {
  if (page === 'Contacts') return <UsersRound size={22} />
  if (page === 'Tasks & Activities') return <CheckSquare size={22} />
  if (page === 'Pipeline') return <Activity size={22} />
  if (page === 'Team & Audit') return <ShieldCheck size={22} />
  return <Layers3 size={22} />
}
