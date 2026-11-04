import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { EntityPage, RailCard, SlideOut } from './Overlay'

type ListRow = { id: string; name: string; description: string | null; list_kind: string; archived_at: string | null }
type MemberRow = { list_id: string; contact_id: string; contact: { id: string; first_name: string; last_name: string; email: string | null } | null }
type ContactOption = { id: string; first_name: string; last_name: string; email: string | null }

const MEMBER_SELECT = 'list_id,contact_id,contact:contacts(id,first_name,last_name,email)'

export function ListsPanel({ userId, canWrite }: { userId: string; canWrite: boolean }) {
  const [orgId, setOrgId] = useState('')
  const [lists, setLists] = useState<ListRow[]>([])
  const [selectedListId, setSelectedListId] = useState('')
  const [members, setMembers] = useState<MemberRow[]>([])
  const [contacts, setContacts] = useState<ContactOption[]>([])
  const [createOpen, setCreateOpen] = useState(false)
  const [addOpen, setAddOpen] = useState(false)
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
        supabase!.from('contacts').select('id,first_name,last_name,email').eq('organization_id', membership.data.organization_id).is('archived_at', null).order('first_name').limit(500),
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
      const result = await supabase!.from('contact_list_members').select(MEMBER_SELECT).eq('organization_id', orgId).eq('list_id', selectedListId)
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
    else {
      setLists(current => [...current, result.data as ListRow].sort((a, b) => a.name.localeCompare(b.name)))
      setName(''); setDescription(''); setCreateOpen(false)
    }
    setSaving(false)
  }

  async function addMember() {
    if (!canWrite || !orgId || !selectedListId || !addContactId) return
    setSaving(true)
    setError('')
    const result = await supabase!.from('contact_list_members').insert({ organization_id: orgId, list_id: selectedListId, contact_id: addContactId, added_by: userId })
    if (result.error) setError('Contact could not be added to the list.')
    else {
      // Show the new member immediately from the contact we already loaded, then re-read the list to confirm.
      const added = contacts.find(contact => contact.id === addContactId)
      if (added) setMembers(current => [...current, { list_id: selectedListId, contact_id: added.id, contact: { id: added.id, first_name: added.first_name, last_name: added.last_name, email: added.email } }])
      setAddContactId(''); setAddOpen(false)
      const reload = await supabase!.from('contact_list_members').select(MEMBER_SELECT).eq('organization_id', orgId).eq('list_id', selectedListId)
      if (reload.error) setError('The contact was added, but the list could not be refreshed. Reopen the list to check.')
      else setMembers((reload.data ?? []) as unknown as MemberRow[])
    }
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
  const addableContacts = contacts.filter(contact => !members.some(member => member.contact_id === contact.id))

  return <section className="panel sequences-panel">
    <div className="panel-heading">
      <div><h2>Leads & Lists</h2><p>Organize contacts into reusable audience lists.</p></div>
      {canWrite && <div className="panel-actions"><button className="primary-button" type="button" disabled={!orgId} onClick={() => setCreateOpen(true)}><Plus size={15} /> New list</button></div>}
    </div>
    {error && <p className="inline-error" role="alert">{error}</p>}
    {loading ? <div className="table-message">Loading lists...</div> : lists.length ? <div className="contact-table-wrap"><table className="contact-table">
      <thead><tr><th>List</th><th>Kind</th><th aria-label="Actions" /></tr></thead>
      <tbody>{lists.map(list => <tr key={list.id}>
        <td><button className="text-action" type="button" onClick={() => setSelectedListId(list.id)}>{list.name}</button></td>
        <td>{list.list_kind}</td>
        <td className="row-actions">{canWrite && <button className="archive-button" type="button" onClick={() => void archiveList(list)}>Archive</button>}</td>
      </tr>)}</tbody>
    </table></div> : !error && <div className="table-message">No lists yet. {canWrite ? 'Create your first audience list.' : 'No lists are available.'}</div>}

    <SlideOut open={createOpen} onClose={() => setCreateOpen(false)} title="New list" description="A list groups contacts for campaigns and sequences.">
      <form className="slideout-form" onSubmit={createList}>
        <label>List name<input value={name} onChange={e => setName(e.target.value)} required maxLength={200} /></label>
        <label>Description<input value={description} onChange={e => setDescription(e.target.value)} maxLength={500} placeholder="Optional" /></label>
        <div className="slideout-actions"><button className="secondary-button" type="button" onClick={() => setCreateOpen(false)}>Cancel</button><button className="primary-button" disabled={saving || !orgId}>{saving ? 'Saving…' : 'Create list'}</button></div>
      </form>
    </SlideOut>

    <EntityPage open={!!selectedList} onClose={() => setSelectedListId('')} kicker="Leads & Lists" title={selectedList?.name ?? ''}
      sidebar={selectedList ? <RailCard title="Summary" rows={[['Kind', selectedList.list_kind], ['Members', members.length], ['Description', selectedList.description]]} /> : undefined}>
      {selectedList && <>
        {error && <p className="inline-error" role="alert">{error}</p>}
        <section className="record-card">
          <div className="record-card-head">
            <h3>Members</h3>
            {canWrite && <button className="primary-button" type="button" onClick={() => { setAddOpen(true); setAddContactId('') }}><Plus size={15} /> Add contact</button>}
          </div>
          <div className="stat-tiles">
            <div className="stat-tile"><span>Members</span><b>{members.length}</b></div>
            <div className="stat-tile"><span>Available to add</span><b>{addableContacts.length}</b></div>
          </div>
          {members.length ? <div className="contact-table-wrap"><table className="contact-table">
            <thead><tr><th>Contact</th><th>Email</th><th aria-label="Actions" /></tr></thead>
            <tbody>{members.map(member => <tr key={member.contact_id}>
              <td>{member.contact ? `${member.contact.first_name} ${member.contact.last_name}` : member.contact_id}</td>
              <td>{member.contact?.email ?? '—'}</td>
              <td className="row-actions">{canWrite && <button className="archive-button" type="button" disabled={saving} onClick={() => void removeMember(member.contact_id)}>Remove</button>}</td>
            </tr>)}</tbody>
          </table></div> : <p className="record-card-note">No contacts in this list yet.</p>}
        </section>

        <SlideOut open={addOpen && canWrite} onClose={() => setAddOpen(false)} title="Add contact" description={`Add a contact to ${selectedList.name}.`}>
          <div className="slideout-form">
            <label>Contact<select value={addContactId} onChange={e => setAddContactId(e.target.value)}><option value="">Choose a contact</option>{addableContacts.map(contact => <option key={contact.id} value={contact.id}>{contact.first_name} {contact.last_name}</option>)}</select></label>
            {error && <p className="inline-error" role="alert">{error}</p>}
            <div className="slideout-actions"><button className="secondary-button" type="button" onClick={() => setAddOpen(false)}>Cancel</button><button className="primary-button" type="button" disabled={saving || !addContactId} onClick={() => void addMember()}>{saving ? 'Adding…' : 'Add to list'}</button></div>
          </div>
        </SlideOut>
      </>}
    </EntityPage>
  </section>
}
