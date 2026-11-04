import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { AVATAR_MAX_BYTES, ensureProfile, loadProfile, removeAvatar, saveDisplayName, uploadAvatar } from '../lib/profile'
import type { Profile } from '../lib/profile'
import { ProfileAvatar } from './ProfileAvatar'

type Member = { organization_id: string; role: string }

export function SettingsPanel({
  userId,
  email,
  profile,
  onProfileChange,
}: {
  userId: string
  email: string
  profile: Profile | null
  onProfileChange: (profile: Profile | null) => void
}) {
  const [orgName, setOrgName] = useState('')
  const [role, setRole] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [name, setName] = useState(profile?.display_name ?? '')
  const [busy, setBusy] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

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

  // Make sure a profile row exists (CREATE), then keep the parent's copy in sync (READ).
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
    // onProfileChange is a stable setter from the parent; load once per user.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  useEffect(() => { setName(profile?.display_name ?? '') }, [profile?.display_name])

  async function run(action: () => Promise<void>) {
    setBusy(true); setError(''); setNotice('')
    try { await action() }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'Something went wrong. Try again.') }
    finally { setBusy(false) }
  }

  // UPDATE display name
  function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void run(async () => {
      onProfileChange(await saveDisplayName(userId, name))
      setNotice('Your name was saved.')
    })
  }

  // CREATE/UPDATE picture
  function onFilePicked(file: File | undefined) {
    if (fileInput.current) fileInput.current.value = ''
    if (!file) return
    void run(async () => {
      onProfileChange(await uploadAvatar(userId, file))
      setNotice('Your profile picture was updated.')
    })
  }

  // DELETE picture
  function deletePicture() {
    if (!profile?.avatar_path || !window.confirm('Remove your profile picture?')) return
    const currentPath = profile.avatar_path
    void run(async () => {
      onProfileChange(await removeAvatar(userId, currentPath))
      setNotice('Your profile picture was removed.')
    })
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
