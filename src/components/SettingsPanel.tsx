import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { AVATAR_MAX_BYTES, ensureProfile, loadProfile, removeAvatar, saveDisplayName, uploadAvatar } from '../lib/profile'
import type { Profile } from '../lib/profile'
import { ProfileAvatar } from './ProfileAvatar'
import { SlideOut } from './Overlay'

type Member = { organization_id: string; role: string }
type Industry = { id: string; name: string; description: string | null; archived_at: string | null }

export function SettingsPanel({
  userId,
  email,
  profile,
  onProfileChange,
  canWrite,
}: {
  userId: string
  email: string
  profile: Profile | null
  onProfileChange: (profile: Profile | null) => void
  canWrite: boolean
}) {
  const [orgId, setOrgId] = useState('')
  const [orgName, setOrgName] = useState('')
  const [role, setRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [name, setName] = useState(profile?.display_name ?? '')
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement | null>(null)

  // Industries
  const [industries, setIndustries] = useState<Industry[]>([])
  const [indOpen, setIndOpen] = useState(false)
  const [newIndName, setNewIndName] = useState('')
  const [newIndDesc, setNewIndDesc] = useState('')
  const [indBusy, setIndBusy] = useState(false)

  useEffect(() => {
    let active = true
    void (async () => {
      const membership = await supabase!.from('memberships').select('organization_id,role').eq('user_id', userId).limit(1).maybeSingle()
      if (!active) return
      if (membership.error || !membership.data) { setError('Your account is not assigned to a workspace.'); setLoading(false); return }
      setRole((membership.data as Member).role)
      setOrgId((membership.data as Member).organization_id)
      const org = await supabase!.from('organizations').select('name').eq('id', (membership.data as Member).organization_id).maybeSingle()
      if (active) setOrgName(org.data?.name ?? '')
      setLoading(false)
    })()
    return () => { active = false }
  }, [userId])

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        await ensureProfile(userId)
        const loaded = await loadProfile(userId)
        if (active) onProfileChange(loaded)
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'Your profile could not be loaded.')
      }
    })()
    return () => { active = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  useEffect(() => { setName(profile?.display_name ?? '') }, [profile?.display_name])

  useEffect(() => {
    if (!orgId) return
    let active = true
    void (async () => {
      const res = await supabase!.from('industry_categories').select('id,name,description,archived_at').eq('organization_id', orgId).is('archived_at', null).order('name')
      if (active && !res.error) setIndustries(res.data ?? [])
    })()
    return () => { active = false }
  }, [orgId])

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('')
    try { await action() }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Something went wrong. Try again.') }
    finally { setBusy(false) }
  }

  function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void run(async () => {
      onProfileChange(await saveDisplayName(userId, name))
      setNotice('Your name was saved.')
    })
  }

  function onFilePicked(file: File | undefined) {
    if (fileInput && fileInput.current) fileInput.current.value = ''
    if (!file) return
    void run(async () => {
      onProfileChange(await uploadAvatar(userId, file))
      setNotice('Your profile picture was updated.')
    })
  }

  function deletePicture() {
    if (!profile?.avatar_path || !window.confirm('Remove your profile picture?')) return
    const currentPath = profile.avatar_path
    void run(async () => {
      onProfileChange(await removeAvatar(userId, currentPath))
      setNotice('Your profile picture was removed.')
    })
  }

  async function saveIndustry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!newIndName.trim()) { setError('Industry name is required.'); return }
    setIndBusy(true); setError('')
    try {
      const result = await supabase!.from('industry_categories').insert({ organization_id: orgId, name: newIndName.trim(), description: newIndDesc.trim() || null, created_by: userId }).select('id,name,description,archived_at').single()
      if (result.error) {
        if (result.error.code === '23505') throw new Error('An industry with that name already exists.')
        throw new Error(result.error.message)
      }
      setIndustries(current => [...current, result.data].sort((a, b) => a.name.localeCompare(b.name)))
      setNewIndName(''); setNewIndDesc(''); setIndOpen(false)
      setNotice('Industry added.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save industry.')
    } finally {
      setIndBusy(false)
    }
  }

  async function archiveIndustry(industry: Industry) {
    if (!window.confirm(`Remove industry "${industry.name}"? This is safe if no contact is still using it.`)) return
    const result = await supabase!.from('industry_categories').update({ archived_at: new Date().toISOString() }).eq('id', industry.id)
    if (result.error) setError('Could not remove industry.')
    else setIndustries(current => current.filter(item => item.id !== industry.id))
  }

  const displayLabel = profile?.display_name || email || 'You'
  const dbConfigured = Boolean(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY)
  const mailboxConfigured = Boolean(import.meta.env.VITE_MAILBOX_WORKER_URL)


  return <>
    <section className="panel settings-section">
      <div className="panel-heading"><div><h2>Profile</h2><p>How you appear to your team.</p></div></div>
      {error && <p className="inline-error" role="alert">{error}</p>}
      {notice && <p className="success-message" role="status">{notice}</p>}
      <div className="profile-editor">
        <div className="profile-photo">
          <ProfileAvatar path={profile?.avatar_path ?? null} label={displayLabel} size="lg" />
          <div className="profile-photo-actions">
            <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={event => onFilePicked(event.target.files?.[0])} />
            <button type="button" className="secondary-button" disabled={busy || !profile} onClick={() => fileInput.current?.click()}>{profile?.avatar_path ? 'Change photo' : 'Upload photo'}</button>
            {profile?.avatar_path && <button type="button" className="archive-button" disabled={busy} onClick={deletePicture}>Remove photo</button>}
            <small>PNG, JPEG or WebP, up to {Math.round(AVATAR_MAX_BYTES / 1024 / 1024)} MB.</small>
          </div>
        </div>
        <form className="profile-form" onSubmit={saveName}>
          <label>Display name<input value={name} onChange={event => setName(event.target.value)} maxLength={80} placeholder="Your name" /></label>
          <label>Email<input value={email} disabled readOnly /></label>
          <div className="profile-form-actions">
            <button className="primary-button" disabled={busy || !profile}>{busy ? 'Saving…' : 'Save name'}</button>
          </div>
        </form>
      </div>
    </section>

    <section className="panel settings-section">
      <div className="panel-heading">
        <div><h2>Industries</h2><p>Manage the categorized list used across contacts, companies, and sequences. Email-verified opt-ins are still honored.</p></div>
        {canWrite ? <button type="button" className="primary-button" disabled={!orgId} onClick={() => setIndOpen(true)}><Plus size={15} /> Add industry</button> : null}
      </div>
      <SlideOut open={indOpen} onClose={() => setIndOpen(false)} title="Add industry" description="Add a new industry category to this workspace.">
        <form className="slideout-form" onSubmit={saveIndustry}>
          <label>Name<input value={newIndName} onChange={event => setNewIndName(event.target.value)} required maxLength={100} placeholder="e.g. Telecommunications" /></label>
          <label>Description<input value={newIndDesc} onChange={event => setNewIndDesc(event.target.value)} maxLength={200} placeholder="Optional description" /></label>
          <div className="slideout-actions">
            <button type="button" className="secondary-button" onClick={() => setIndOpen(false)} disabled={indBusy}>Cancel</button>
            <button type="submit" className="primary-button" disabled={indBusy || !orgId}>{indBusy ? 'Saving…' : 'Add industry'}</button>
          </div>
        </form>
      </SlideOut>
      {industries.length ? (
        <div className="contact-table-wrap">
          <table className="contact-table">
            <thead><tr><th>Name</th><th>Description</th><th>Actions</th></tr></thead>
            <tbody>{industries.map(item => (
              <tr key={item.id}>
                <td><b>{item.name}</b></td>
                <td>{item.description || '—'}</td>
                <td><button type="button" className="archive-button" onClick={() => void archiveIndustry(item)}>Remove</button></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <div className="table-message">No industries yet. Click "Add industry" to manage this list.</div>}
    </section>

    <section className="panel settings-section">
      <div className="panel-heading"><div><h2>Workspace</h2><p>Preferences and setup status (read-only).</p></div></div>
      {loading ? <div className="table-message">Loading settings...</div> : <>
        <dl className="contact-readonly">
          <dt>Workspace</dt><dd>{orgName || 'Not set'}</dd>
          <dt>Your role</dt><dd>{role ? role.replaceAll('_', ' ') : 'No membership'}</dd>
          <dt>Database</dt><dd>{dbConfigured ? 'Configured' : 'Not configured'}</dd>
          <dt>Mailbox worker</dt><dd>{mailboxConfigured ? 'Configured' : 'Not configured'}</dd>
        </dl>
        <div className="data-note"><span>Secrets and trusted credentials are managed in the server platform's secret store, never in the browser.</span></div>
      </>}
    </section>
  </>
}
