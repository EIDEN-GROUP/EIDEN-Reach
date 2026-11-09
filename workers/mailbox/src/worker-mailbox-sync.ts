import type { Env } from './runtime'
import { serviceHeaders } from './runtime'
import { decryptCredentials } from './worker-crypto'
import { listImapFolders, searchImapUids, fetchImapMessages } from './protocols'
import { mapParsedEmail } from './mail-mapping'
import { stopEnrollmentsForReply, reconcileReplyStoppedEnrollments, processBounceMessage } from './worker-reply'
import PostalMime from 'postal-mime'

async function rpc<T>(env: Env, name: string, body: Record<string, unknown>): Promise<T> {
  const result = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: serviceHeaders(env, true), body: JSON.stringify(body),
  })
  if (!result.ok) throw new Error(`rpc_${name}_failed`)
  return await result.json() as T
}

export async function runMailboxSync(env: Env, organizationId: string, mailboxId: string): Promise<{
  ok: true
  mailboxId: string
  folders: Array<{ provider_folder_id: string; display_name: string; highest_synced_uid: number; sync_state: string }>
  synchronizedMessages: number
  hasMore: boolean
  message: string
}> {
  const base = env.SUPABASE_URL.replace(/\/$/, '')

  const accountUrl = new URL(`${base}/rest/v1/mailbox_accounts`)
  accountUrl.searchParams.set('select', 'id,organization_id,owner_id,email_address,connection_state')
  accountUrl.searchParams.set('id', `eq.${mailboxId}`)
  accountUrl.searchParams.set('organization_id', `eq.${organizationId}`)
  accountUrl.searchParams.set('limit', '1')
  const accountRes = await fetch(accountUrl, { headers: serviceHeaders(env) })
  if (!accountRes.ok) throw new Error(`mailbox_load_${accountRes.status}`)
  const accounts = await accountRes.json() as Array<{ id: string; organization_id: string; owner_id: string; email_address: string; connection_state: string }>
  const account = accounts[0]
  if (!account) throw new Error('mailbox_not_found')

  const credUrl = new URL(`${base}/rest/v1/mailbox_credential_refs`)
  credUrl.searchParams.set('select', 'key_version,nonce,credential_ciphertext')
  credUrl.searchParams.set('mailbox_account_id', `eq.${mailboxId}`)
  credUrl.searchParams.set('limit', '1')
  const credRes = await fetch(credUrl, { headers: serviceHeaders(env) })
  if (!credRes.ok) throw new Error(`mailbox_creds_${credRes.status}`)
  const creds = await credRes.json() as Array<{ key_version: string; nonce: string; credential_ciphertext: string }>
  const cred = creds[0]
  if (!cred) throw new Error('mailbox_creds_missing')

  let password: string
  try {
    password = await decryptCredentials(env, account.organization_id, account.email_address, { key_version: cred.key_version, nonce: cred.nonce, ciphertext: cred.credential_ciphertext })
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'decrypt_failed')
  }

  let folders: Array<{ name: string; specialUse?: string }> = []
  try {
    folders = await listImapFolders(account.email_address, password)
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : 'folder_discovery_failed')
  }

  const folderRows: Array<{ provider_folder_id: string; display_name: string; highest_synced_uid: number; sync_state: string }> = []
  for (const folder of folders) {
    const folderQuery = new URL(`${base}/rest/v1/mailbox_folders`)
    folderQuery.searchParams.set('select', 'id')
    folderQuery.searchParams.set('mailbox_account_id', `eq.${mailboxId}`)
    folderQuery.searchParams.set('provider_folder_id', `eq.${folder.name}`)
    folderQuery.searchParams.set('limit', '1')
    const existingRes = await fetch(folderQuery, { headers: serviceHeaders(env) })
    const existing = existingRes.ok ? await existingRes.json() as Array<{ id: string }> : []
    const payload = { mailbox_account_id: mailboxId, provider_folder_id: folder.name, display_name: folder.name, special_use: folder.specialUse ?? null, sync_state: 'healthy' }
    const url = `${base}/rest/v1/mailbox_folders`
    const res = existing[0]
      ? await fetch(`${url}?mailbox_account_id=eq.${mailboxId}&provider_folder_id=eq.${encodeURIComponent(folder.name)}`, { method: 'PATCH', headers: { ...serviceHeaders(env, true), Prefer: 'return=representation' }, body: JSON.stringify(payload) })
      : await fetch(url, { method: 'POST', headers: { ...serviceHeaders(env, true), Prefer: 'return=representation' }, body: JSON.stringify(payload) })
    if (!res.ok) throw new Error(`folder_write_${res.status}`)
    const selectUrl = new URL(`${base}/rest/v1/mailbox_folders`)
    selectUrl.searchParams.set('select', 'provider_folder_id,display_name,highest_synced_uid,sync_state')
    selectUrl.searchParams.set('mailbox_account_id', `eq.${mailboxId}`)
    selectUrl.searchParams.set('provider_folder_id', `eq.${folder.name}`)
    selectUrl.searchParams.set('limit', '1')
    const r = await fetch(selectUrl, { headers: serviceHeaders(env) })
    const rows = r.ok ? await r.json() as Array<{ provider_folder_id: string; display_name: string; highest_synced_uid: number; sync_state: string }> : []
    if (rows[0]) folderRows.push(rows[0])
  }

  const inbox = folders.find(folder => folder.specialUse === 'inbox')
    ?? folders.find(folder => folder.name.toLowerCase() === 'inbox')
    ?? folders[0]
  let synchronizedMessages = 0
  let hasMore = false

  if (inbox) {
    const cursor = folderRows.find(folder => folder.provider_folder_id === inbox.name)?.highest_synced_uid ?? 0
    const search = await searchImapUids(account.email_address, password, inbox.name, Number(cursor), 5)
    hasMore = search.hasMore
    const fetched = await fetchImapMessages(account.email_address, password, inbox.name, search.uids)

    for (const item of fetched) {
      const parsed = await PostalMime.parse(item.raw, {
        maxHeadersSize: 64 * 1024,
        maxNestingDepth: 20,
      })
      const mapped = mapParsedEmail(parsed, {
        organizationId: account.organization_id,
        mailboxId,
        folderProviderId: inbox.name,
        uid: item.uid,
      })
      await rpc<string>(env, 'persist_inbound_message', {
        target_organization: account.organization_id,
        target_mailbox: mailboxId,
        target_folder_provider_id: inbox.name,
        target_folder_name: inbox.name,
        target_special_use: inbox.specialUse ?? null,
        target_uid: item.uid,
        target_thread_provider_id: mapped.threadProviderId,
        target_provider_message_key: mapped.providerMessageKey,
        target_rfc_message_id: mapped.message.rfc_message_id,
        target_in_reply_to: mapped.message.in_reply_to,
        target_references: mapped.message.references_header,
        target_subject: mapped.message.subject,
        target_snippet: mapped.message.snippet,
        target_text_body: mapped.message.text_body,
        target_html_body: mapped.message.html_body,
        target_received_at: mapped.message.received_at,
        target_raw_headers: mapped.message.raw_headers,
        target_participants: mapped.participants,
        target_attachments: mapped.attachments,
      })
      await stopEnrollmentsForReply(env, account.organization_id, mapped.participants, mapped.message.in_reply_to, mapped.message.references_header, mapped.message.subject ?? null, mapped.message.text_body ?? null)
      await processBounceMessage(env, account.organization_id, mapped.participants, mapped.message.subject, (mapped.message as { raw_headers?: unknown }).raw_headers)
      synchronizedMessages += 1
    }

    if (search.uids.length === 0) {
      await fetch(`${base}/rest/v1/mailbox_folders?mailbox_account_id=eq.${mailboxId}&provider_folder_id=eq.${encodeURIComponent(inbox.name)}`, {
        method: 'PATCH',
        headers: { ...serviceHeaders(env, true), Prefer: 'return=minimal' },
        body: JSON.stringify({ last_synced_at: new Date().toISOString(), sync_state: 'healthy', last_error_code: null }),
      })
    }
  }

  const mailboxUpdate = await fetch(`${base}/rest/v1/mailbox_accounts?id=eq.${mailboxId}`, {
    method: 'PATCH',
    headers: { ...serviceHeaders(env, true), Prefer: 'return=minimal' },
    body: JSON.stringify({ last_sync_at: new Date().toISOString(), connection_state: 'connected' }),
  })
  if (!mailboxUpdate.ok) throw new Error(`mailbox_update_${mailboxUpdate.status}`)

  try { await reconcileReplyStoppedEnrollments(env, organizationId, mailboxId) } catch (reconcileError) { console.error('REPLY_RECONCILE_ERROR', reconcileError) }

  return {
    ok: true,
    mailboxId,
    folders: folderRows,
    synchronizedMessages,
    hasMore,
    message: hasMore
      ? `Synchronized ${synchronizedMessages} messages. More messages are available for the next batch.`
      : `Synchronized ${synchronizedMessages} messages.`,
  }
}
