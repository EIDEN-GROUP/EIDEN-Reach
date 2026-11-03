import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { supabase } from '../lib/supabase'

type ListRow = { id: string; name: string; description: string | null; list_kind: string; archived_at: string | null }
type MemberRow = { list_id: string; contact_id: string; contact: { id: string; first_name: string; last_name: string; email: string | null } | null }

export function ListsPanel({ userId, canWrite }: { userId: string; canWrite: boolean }) {
  const [orgId, setOrgId] = useState('')
  const [lists, setLists] = useState<ListRow[]>([])
  const [selectedListId, setSelectedListId] = useState('')
  const [members, setMembers] = useState<MemberRow[]>([])
  const [contacts, setContacts] = useState<{ id: string; first_name: string; last_name: string }[]>([])
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [addContactId, setAddContactId] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    void (async () => {
      const membership = await supabase!.from('memberships').select('organization_id').eq('user_id', userId).limit(1).maybeSingle()
      if (!active) return
      if (membership.error || !membership.data) { setError('Your account is not assigned to a workspace.'); setLoading(false); return }
      setOrgId(membership.data.organization_id)
      const [listResult, contactResult] = await Promise.all([
        supabase!.from('contact_lists').select('id,name,description,list_kind,archived_at').eq('organization_id', membership.data.organization_id).is('archived_at', null).order('name'),
        supabase!.from('contacts').select('id,first_name,last_name').eq('organization_id', membership.data.organization_id).is('archived_at', null).order('first_name').limit(500),
      ])
      if (!active) return
      if (listResult.error || contactResult.error) setError('Lists or contacts could not be loaded.')
      else { setLists(listResult.data ?? []); setContacts(contactResult.data ?? []) }
      setLoading(false)
    })()
    return () => { active = false }
  }, [userId])

  useEffect(() => {
    if (!orgId || !selectedListId) { setMembers([]); return }
    let active = true
    void (async () => {
      const result = await supabase!.from('contact_list_members').select('list_id,contact_id,contact:contacts(id,first_name,last_name,email)').eq('organization_id', orgId).eq('list_id', selectedListId)
      if (!active) return
      if (result.error) setError('List members could not be loaded.')
      else setMembers((result.data ?? []) as unknown as MemberRow[])
    })()
    return () => { active = false }
  }, [orgId, selectedListId])

  async function createList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canWrite || !orgId) return
    if (!name.trim()) { setError('List name is required.'); return }
    setSaving(true)
    setError('')
    const result = await supabase!.from('contact_lists').insert({ organization_id: orgId, name: name.trim(), description: description.trim() || null, owner_id: userId }).select('id,name,description,list_kind,archived_at').single()
    if (result.error) setError(result.error.code === '23505' ? 'A list with that name already exists.' : 'The list could not be created.')
    else { setLists(current => [...current, result.data as ListRow].sort((a, b) => a.name.localeCompare(b.name))); setName(''); setDescription('') }
    setSaving(false)
  }

  async function addMember() {
    if (!canWrite || !orgId || !selectedListId || !addContactId) return
    setSaving(true)
    setError('')
    const result = await supabase!.from('contact_list_members').insert({ organization_id: orgId, list_id: selectedListId, contact_id: addContactId, added_by: userId })
    if (result.error) setError('Contact could not be added to the list.')
    else { setAddContactId(''); const reload = await supabase!.from('contact_list_members').select('list_id,contact_id,contact:contacts(id,first_name,last_name,email)').eq('organization_id', orgId).eq('list_id', selectedListId); if (!reload.error) setMembers((reload.data ?? []) as unknown as MemberRow[]) }
    setSaving(false)
  }

  async function removeMember(contactId: string) {
    if (!canWrite || !orgId || !selectedListId) return
    setSaving(true)
    setError('')
    const result = await supabase!.from('contact_list_members').delete().eq('organization_id', orgId).eq('list_id', selectedListId).eq('contact_id', contactId)
    if (result.error) setError('Contact could not be removed from the list.')
    else setMembers(current => current.filter(member => member.contact_id !== contactId))
    setSaving(false)
  }

  async function archiveList(list: ListRow) {
    if (!canWrite || !window.confirm(`Archive ${list.name}?`)) return
    setSaving(true)
    setError('')
    const result = await supabase!.from('contact_lists').update({ archived_at: new Date().toISOString() }).eq('id', list.id).eq('organization_id', orgId)
    if (result.error) setError('List could not be archived.')
    else { setLists(current => current.filter(item => item.id !== list.id)); if (selectedListId === list.id) setSelectedListId('') }
    setSaving(false)
  }

  const selectedList = lists.find(list => list.id === selectedListId)

  return <section className="panel contacts-panel">
    <div className="panel-heading"><div><h2>Leads & Lists</h2><p>Organize contacts into reusable audience lists.</p></div></div>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {canWrite && <form className="contact-form" onSubmit={createList}>
      <label>List name<input value={name} onChange={e => setName(e.target.value)} required maxLength={200} /></label>
      <label>Description<input value={description} onChange={e => setDescription(e.target.value)} maxLength={500} placeholder="Optional" /></label>
      <button className="primary-button" disabled={saving || !orgId}>{saving ? 'Saving...' : 'Create list'}</button>
    </form>}
    {loading ? <div className="table-message">Loading lists...</div> : lists.length ? <div className="contact-table-wrap"><table className="contact-table"><thead><tr><th>List</th><th>Kind</th><th>Action</th></tr></thead><tbody>{lists.map(list => <tr key={list.id}><td><button className="text-action" onClick={() => setSelectedListId(list.id)}>{list.name}</button></td><td>{list.list_kind}</td><td>{canWrite && <button className="archive-button" type="button" onClick={() => void archiveList(list)}>Archive</button>}</td></tr>)}</tbody></table></div> : !error && <div className="table-message">No lists yet. {canWrite ? 'Create a list above.' : 'No lists are available.'}</div>}
    {selectedList && <section className="contact-editor" aria-label="List members">
      <div className="editor-heading"><div><h3>{selectedList.name}</h3><p>{selectedList.description ?? 'List members'}</p></div><button className="secondary-button" type="button" onClick={() => setSelectedListId('')}>Close</button></div>
      {canWrite && <div className="contact-form"><label>Add contact<select value={addContactId} onChange={e => setAddContactId(e.target.value)}><option value="">Choose a contact</option>{contacts.filter(contact => !members.some(member => member.contact_id === contact.id)).map(contact => <option key={contact.id} value={contact.id}>{contact.first_name} {contact.last_name}</option>)}</select></label><button className="primary-button" type="button" disabled={saving || !addContactId} onClick={() => void addMember()}>{saving ? 'Adding...' : 'Add to list'}</button></div>}
      {members.length ? <div className="contact-table-wrap"><table className="contact-table"><thead><tr><th>Contact</th><th>Email</th><th>Action</th></tr></thead><tbody>{members.map(member => <tr key={member.contact_id}><td>{member.contact ? `${member.contact.first_name} ${member.contact.last_name}` : member.contact_id}</td><td>{member.contact?.email ?? '—'}</td><td>{canWrite && <button className="archive-button" type="button" onClick={() => void removeMember(member.contact_id)}>Remove</button>}</td></tr>)}</tbody></table></div> : <div className="table-message">No contacts in this list yet.</div>}
    </section>}
  </section>
}
