import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'
import { noteInput } from '../lib/validation'

type Note = { id: string; body: string; author_id: string | null; created_at: string; updated_at: string }
type Profile = { id: string; display_name: string | null }

type NotesPanelProps = {
  organizationId: string
  userId: string
  canWrite: boolean
  entityType: 'contact' | 'company' | 'deal'
  entityId: string
}

function entityColumn(entityType: NotesPanelProps['entityType']) {
  if (entityType === 'contact') return 'contact_id'
  if (entityType === 'company') return 'company_id'
  return 'deal_id'
}

export function NotesPanel({ organizationId, userId, canWrite, entityType, entityId }: NotesPanelProps) {
  const [notes, setNotes] = useState<Note[]>([])
  const [profiles, setProfiles] = useState<Record<string, string>>({})
  const [body, setBody] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    if (!organizationId || !entityId) return
    setLoading(true)
    setError('')
    const column = entityColumn(entityType)
    const result = await supabase!.from('notes').select('id,body,author_id,created_at,updated_at').eq('organization_id', organizationId).eq(column, entityId).order('created_at', { ascending: false }).limit(100)
    if (result.error) { setError('Notes could not be loaded.'); setLoading(false); return }
    const loaded = result.data ?? []
    setNotes(loaded)
    const authorIds = [...new Set(loaded.map(note => note.author_id).filter((id): id is string => Boolean(id)))]
    if (authorIds.length) {
      const profileResult = await supabase!.from('profiles').select('id,display_name').in('id', authorIds)
      if (!profileResult.error) {
        const map: Record<string, string> = {}
        for (const profile of (profileResult.data ?? []) as Profile[]) map[profile.id] = profile.display_name ?? 'Unknown user'
        setProfiles(map)
      }
    }
    setLoading(false)
  }

  useEffect(() => { void load() }, [organizationId, entityType, entityId])

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canWrite || !organizationId || !entityId) return
    const parsed = noteInput.safeParse({ body })
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? 'Check note text.'); return }
    setSaving(true)
    setError('')
    const column = entityColumn(entityType)
    const result = await supabase!.from('notes').insert({ organization_id: organizationId, [column]: entityId, author_id: userId, body: parsed.data.body }).select('id,body,author_id,created_at,updated_at').single()
    if (result.error) setError('The note could not be saved. Check workspace permissions.')
    else { setNotes(current => [result.data as Note, ...current]); setBody('') }
    setSaving(false)
  }

  async function remove(note: Note) {
    if (!canWrite || !window.confirm('Delete this note?')) return
    setSaving(true)
    setError('')
    const result = await supabase!.from('notes').delete().eq('id', note.id).eq('organization_id', organizationId)
    if (result.error) setError('The note could not be deleted.')
    else setNotes(current => current.filter(item => item.id !== note.id))
    setSaving(false)
  }

  return <section className="activity-timeline" aria-label="Notes">
    <h4>Notes</h4>
    {canWrite && <form className="contact-form" onSubmit={create}>
      <label>Note<textarea value={body} onChange={event => setBody(event.target.value)} required maxLength={4000} rows={3} placeholder="Add context for this record" /></label>
      <button className="primary-button" type="submit" disabled={saving || !organizationId}>{saving ? 'Saving...' : 'Add note'}</button>
    </form>}
    {error && <p className="inline-error" role="alert">{error}</p>}
    {loading ? <p>Loading notes...</p> : notes.length ? <ol>{notes.map(note => <li key={note.id}><div><b>{note.author_id ? (profiles[note.author_id] ?? 'Unknown user') : 'Unknown user'}</b><time dateTime={note.created_at}>{new Date(note.created_at).toLocaleString()}</time></div><p>{note.body}</p>{canWrite && <button className="text-action" type="button" onClick={() => void remove(note)}>Delete</button>}</li>)}</ol> : <p>No notes have been recorded.</p>}
  </section>
}
