import { createClient } from 'npm:@supabase/supabase-js@2'

// Managed Workspaces: god-mode bridge for organizations owned by a parent
// (root) organization's super_admin. Normal RLS is untouched; this endpoint
//     - verifies caller belongs to the parent org with super_admin role,
//     - is the only way to see/operate across child workspaces.
const supabaseUrl = Deno.env.get('SUPABASE_URL')
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const appOrigin = Deno.env.get('APP_ORIGIN')

const jsonHeaders = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function respond(body: unknown, status: number, origin: string | null) {
  const headers = new Headers(jsonHeaders)
  if (origin && appOrigin && origin === appOrigin) {
    headers.set('Access-Control-Allow-Origin', origin)
    headers.set('Vary', 'Origin')
    headers.set('Access-Control-Allow-Headers', 'authorization, apikey, content-type, x-client-info')
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  }
  return new Response(JSON.stringify(body), { status, headers })
}

async function getActingOrg(
  admin: ReturnType<typeof createClient>,
  userId: string,
): Promise<{ organizationId: string } | null> {
  const { data } = await admin.from('memberships').select('organization_id,role').eq('user_id', userId).eq('role', 'super_admin').limit(1).maybeSingle()
  if (!data) return null
  return { organizationId: data.organization_id as string }
}

Deno.serve(async request => {
  const origin = request.headers.get('origin')
  if (request.method === 'OPTIONS') return respond(null, 204, origin)
  if (request.method !== 'POST') return respond({ error: 'Method not allowed.' }, 405, origin)
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return respond({ error: 'Workspace administration is not configured on the server.' }, 503, origin)

  const authorization = request.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return respond({ error: 'Sign in to manage managed workspaces.' }, 401, origin)

  try {
    const anon = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } })
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: authData, error: authError } = await anon.auth.getUser(authorization.slice('Bearer '.length))
    if (authError || !authData.user) return respond({ error: 'Your session is invalid or expired.' }, 401, origin)
    const actorId = authData.user.id

    const raw = await request.json().catch(() => null) as Record<string, unknown> | null
    const action = raw?.action as string | undefined
    if (!action) return respond({ error: 'Missing action.' }, 400, origin)

    const acting = await getActingOrg(admin, actorId)
    if (!acting) return respond({ error: 'Only super_admin members can manage workspaces.' }, 403, origin)
    const parentOrganizationId = acting.organizationId

    async function audit(action_: string, resource_type?: string | null, resource_id?: string | null, result_: string = 'success', details: unknown = null): Promise<void> {
      try {
        await admin.from('audit_logs').insert({ organization_id: parentOrganizationId, actor_id: actorId, action: `workspace.${action_}`, resource_type, resource_id, result: result_, details: (details ?? {}) as Record<string, unknown> })
      } catch (error) { console.error('AUDIT_WRITE_FAILED', error) }
    }

    // Guard: the acting org must itself be a root (no parent). Cyclic management is not allowed.
    const { data: parentRow } = await admin.from('organizations').select('parent_organization_id').eq('id', parentOrganizationId).maybeSingle()
    if (parentRow?.parent_organization_id) return respond({ error: 'Only the root workspace can manage child workspaces.' }, 403, origin)

    if (action === 'list') {
      const { data: children, error: childErr } = await admin
        .from('organizations')
        .select('id,name,created_at')
        .eq('parent_organization_id', parentOrganizationId)
        .order('name', { ascending: true })
      if (childErr) { await audit('list', 'organizations', null, 'failure', { message: childErr.message }); return respond({ error: childErr.message }, 503, origin) }

      const workspaces = [] as Array<Record<string, unknown>>
      for (const child of children ?? []) {
        const [{ count: memberCount }, enrollmentRes, sentRes, ownerRes] = await Promise.all([
          admin.from('memberships').select('user_id', { count: 'exact', head: true }).eq('organization_id', child.id),
          admin.from('sequence_enrollments').select('state').eq('organization_id', child.id).limit(2000),
          admin.from('activity_events').select('id', { count: 'exact', head: true }).eq('organization_id', child.id).ilike('event_type', '%sent%'),
          admin.from('memberships').select('user_id').eq('organization_id', child.id).eq('role', 'super_admin').limit(1),
        ])
        const byState: Record<string, number> = {}
        for (const row of (enrollmentRes.data ?? []) as Array<{ state: string }>) byState[row.state] = (byState[row.state] ?? 0) + 1
        const ownerId = (ownerRes.data ?? [])[0]?.user_id ?? null
        let ownerEmail: string | null = null
        let ownerName: string | null = null
        if (ownerId) {
          const { data: prof } = await admin.from('profiles').select('display_name,email').eq('id', ownerId).maybeSingle()
          ownerName = (prof?.display_name ?? null) as string | null
          ownerEmail = (prof?.email ?? null) as string | null
        }
        workspaces.push({
          id: child.id,
          name: child.name,
          createdAt: child.created_at,
          memberCount: memberCount ?? 0,
          enrollmentCount: (enrollmentRes.data ?? []).length,
          enrollmentStates: byState,
          sentCount: sentRes.count ?? 0,
          ownerEmail,
          ownerName,
        })
      }
      await audit('list', 'organizations', null, 'success', { children: workspaces.length })
      return respond({ workspaces }, 200, origin)
    }

    if (action === 'kpis') {
      const workspaceId = raw?.workspaceId
      if (typeof workspaceId !== 'string' || !uuidPattern.test(workspaceId)) return respond({ error: 'Valid workspaceId required.' }, 400, origin)
      const { data: child } = await admin.from('organizations').select('id').eq('id', workspaceId).eq('parent_organization_id', parentOrganizationId).maybeSingle()
      if (!child) { await audit('access_denied', 'organizations', workspaceId, 'denied', { reason: 'not_managed' }); return respond({ error: 'That workspace is not managed by you.' }, 403, origin) }

      const [enrollRes, sentRes, contactsRes, suppressedRes] = await Promise.all([
        admin.from('sequence_enrollments').select('state,stop_reason').eq('organization_id', workspaceId).limit(5000),
        admin.from('activity_events').select('id', { count: 'exact', head: true }).eq('organization_id', workspaceId).ilike('event_type', '%sent%'),
        admin.from('contacts').select('id', { count: 'exact', head: true }).eq('organization_id', workspaceId).is('archived_at', null),
        admin.from('suppression_records').select('id', { count: 'exact', head: true }).eq('organization_id', workspaceId),
      ])
      const byState: Record<string, number> = {}
      for (const row of (enrollRes.data ?? []) as Array<{ state: string }>) byState[row.state] = (byState[row.state] ?? 0) + 1
      const suppressedCount = suppressedRes.count ?? 0
      await audit('kpis', 'organizations', workspaceId, 'success', { emailsSent: sentRes.count ?? 0, contactsTotal: contactsRes.count ?? 0, suppressed: suppressedCount })
      return respond({
        workspaceId,
        enrollmentsByState: byState,
        emailsSent: sentRes.count ?? 0,
        contactsTotal: contactsRes.count ?? 0,
        suppressed: suppressedCount,
      }, 200, origin)
    }

    if (action === 'emails') {
      const workspaceId = raw?.workspaceId
      const limit = Math.min(50, Math.max(1, Number(raw?.limit ?? 20)))
      if (typeof workspaceId !== 'string' || !uuidPattern.test(workspaceId)) return respond({ error: 'Valid workspaceId required.' }, 400, origin)
      const { data: child } = await admin.from('organizations').select('id').eq('id', workspaceId).eq('parent_organization_id', parentOrganizationId).maybeSingle()
      if (!child) { await audit('access_denied', 'organizations', workspaceId, 'denied', { reason: 'not_managed' }); return respond({ error: 'That workspace is not managed by you.' }, 403, origin) }

      const { data: messages, error: msgErr } = await admin
        .from('email_messages')
        .select('id,direction,subject,snippet,received_at,sent_at,thread_id')
        .eq('organization_id', workspaceId)
        .order('received_at', { ascending: false, nullsFirst: false })
        .limit(limit)
      if (msgErr) return respond({ error: msgErr.message }, 503, origin)
      const ids = (messages ?? []).map((m: { id: string }) => m.id)
      const participants = ids.length ? await admin.from('email_message_participants').select('message_id,participant_type,email_address').in('message_id', ids) : { data: [] as Array<{ message_id: string; participant_type: string; email_address: string }> }
      const byMessage = new Map<string, Array<{ participant_type: string; email_address: string }>>()
      for (const p of participants.data ?? []) {
        const arr = byMessage.get(p.message_id) ?? []
        arr.push({ participant_type: p.participant_type, email_address: p.email_address })
        byMessage.set(p.message_id, arr)
      }
      const emails = (messages ?? []).map((m: { id: string; direction: string; subject: string | null; snippet: string | null; received_at: string | null; sent_at: string | null; thread_id: string | null }) => ({
        id: m.id,
        direction: m.direction,
        subject: m.subject,
        snippet: m.snippet,
        receivedAt: m.received_at,
        sentAt: m.sent_at,
        threadId: m.thread_id,
        participants: byMessage.get(m.id) ?? [],
      }))
      await audit('emails', 'email_messages', workspaceId, 'success', { returned: emails.length })
      return respond({ emails }, 200, origin)
    }

    if (action === 'email') {
      const workspaceId = raw?.workspaceId
      const emailId = raw?.emailId
      if (typeof workspaceId !== 'string' || !uuidPattern.test(workspaceId)) return respond({ error: 'Valid workspaceId required.' }, 400, origin)
      if (typeof emailId !== 'string' || !uuidPattern.test(emailId)) return respond({ error: 'Valid emailId required.' }, 400, origin)
      const { data: child } = await admin.from('organizations').select('id').eq('id', workspaceId).eq('parent_organization_id', parentOrganizationId).maybeSingle()
      if (!child) { await audit('access_denied', 'organizations', workspaceId, 'denied', { reason: 'not_managed' }); return respond({ error: 'That workspace is not managed by you.' }, 403, origin) }

      const { data: message, error: msgErr } = await admin
        .from('email_messages')
        .select('id,direction,subject,received_at,sent_at,text_body,html_body')
        .eq('organization_id', workspaceId)
        .eq('id', emailId)
        .maybeSingle()
      if (msgErr || !message) { await audit('email_view', 'email_messages', emailId, 'failure', { workspaceId, reason: msgErr?.message }); return respond({ error: 'Email not found.' }, 404, origin) }
      await audit('email_view', 'email_messages', emailId, 'success', { workspaceId, subject: message.subject ?? null })
      return respond({ id: message.id, direction: message.direction, subject: message.subject, receivedAt: message.received_at, sentAt: message.sent_at, textBody: message.text_body, htmlBody: message.html_body }, 200, origin)
    }

    if (action === 'invite') {
      const email = typeof raw.email === 'string' ? raw.email.trim().toLowerCase() : ''
      const displayName = typeof raw.displayName === 'string' ? raw.displayName.trim() : ''
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { await audit('invite_failed', 'organizations', null, 'denied', { email, reason: 'invalid_email' }); return respond({ error: 'A valid email is required.' }, 400, origin) }

      // Create the new organization first so every invited user always gets their own.
      const orgName = (displayName || email.split('@')[0]) + "'s workspace"
      const { data: newOrg, error: orgErr } = await admin
        .from('organizations')
        .insert({ name: orgName, parent_organization_id: parentOrganizationId })
        .select('id')
        .single()
      if (orgErr || !newOrg) { await audit('invite_failed', 'organizations', null, 'failure', { email, displayName, message: orgErr?.message }); return respond({ error: 'Workspace could not be created.' }, 503, origin) }

      // Look up existing user or invite via Supabase Auth.
      const { data: existingProfile, error: profileErr } = await admin.from('profiles').select('id').ilike('email', email).maybeSingle()
      if (profileErr) { await audit('invite_failed', 'organizations', newOrg.id, 'failure', { email, displayName, message: profileErr.message }); return respond({ error: 'Could not check existing users.' }, 503, origin) }

      let targetUserId: string
      let invitationSent = false
      if (existingProfile) {
        targetUserId = existingProfile.id
        const { data: alreadyMember } = await admin.from('memberships').select('user_id').eq('organization_id', newOrg.id).eq('user_id', targetUserId).maybeSingle()
        if (alreadyMember) { await audit('invite_failed', 'organizations', newOrg.id, 'denied', { email, displayName, reason: 'already_member' }); return respond({ error: 'User already belongs to that workspace.' }, 409, origin) }
      } else {
        const { data: invited, error: inviteErr } = await admin.auth.admin.inviteUserByEmail(email, {
          data: displayName ? { display_name: displayName } : {},
          ...(appOrigin ? { redirectTo: appOrigin } : {}),
        })
        if (inviteErr || !invited.user) { await audit('invite_failed', 'organizations', newOrg.id, 'failure', { email, displayName, message: inviteErr?.message }); return respond({ error: 'Invitation could not be sent.' }, 502, origin) }
        targetUserId = invited.user.id
        invitationSent = true
      }

      const { error: addErr } = await admin.from('memberships').insert({ organization_id: newOrg.id, user_id: targetUserId, role: 'super_admin' })
      if (addErr) { await audit('invite_failed', 'organizations', newOrg.id, 'failure', { email, displayName, message: addErr.message, invitationSent }); return respond({ error: invitationSent ? 'Invite sent but membership could not be created.' : 'Membership could not be created.' }, 503, origin) }

      await audit('invite', 'organizations', newOrg.id, 'success', { email, displayName, invitationSent, targetUserId })
      return respond({ ok: true, invitationSent, organizationId: newOrg.id, message: invitationSent ? 'Invitation sent — new workspace created.' : 'Existing user assigned their own workspace.' }, 200, origin)
    }

    return respond({ error: 'Unsupported action.' }, 400, origin)
  } catch (error) {
    console.error(error)
    return respond({ error: 'Workspace administration request could not be completed.' }, 500, origin)
  }
})
