import { createClient } from 'npm:@supabase/supabase-js@2'
import { canAssignMemberRole, parseTeamInvite, type MemberRole } from '../../../src/lib/team-validation.ts'

const supabaseUrl = Deno.env.get('SUPABASE_URL')
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const appOrigin = Deno.env.get('APP_ORIGIN')

const jsonHeaders = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }

function respond(body: unknown, status: number, origin: string | null) {
  const headers = new Headers(jsonHeaders)
  if (origin && origin === appOrigin) {
    headers.set('Access-Control-Allow-Origin', origin)
    headers.set('Vary', 'Origin')
    headers.set('Access-Control-Allow-Headers', 'authorization, apikey, content-type, x-client-info')
    headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  }
  return new Response(status === 204 ? null : JSON.stringify(body), { status, headers })
}

Deno.serve(async request => {
  const origin = request.headers.get('origin')
  if (origin && appOrigin && origin !== appOrigin) return respond({ error: 'Origin is not allowed.' }, 403, null)
  if (request.method === 'OPTIONS') return respond(null, 204, origin)
  if (request.method !== 'POST') return respond({ error: 'Method not allowed.' }, 405, origin)
  if (!supabaseUrl || !anonKey || !serviceRoleKey) return respond({ error: 'Team administration is not configured on the server.' }, 503, origin)
  if (origin && !appOrigin) return respond({ error: 'The application origin is not configured on the server.' }, 503, null)

  const authorization = request.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return respond({ error: 'Sign in to manage workspace access.' }, 401, origin)

  try {
    const supabase = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authorization } }, auth: { persistSession: false, autoRefreshToken: false } })
    const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data: authData, error: authError } = await supabase.auth.getUser(authorization.slice('Bearer '.length))
    if (authError || !authData.user) return respond({ error: 'Your session is invalid or expired.' }, 401, origin)

    const raw = await request.json().catch(() => null) as Record<string, unknown> | null
    const action = raw?.action
    const organizationId = raw?.organizationId
    if (typeof organizationId !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(organizationId)) {
      return respond({ error: 'A valid workspace is required.' }, 400, origin)
    }

    const { data: actingMembership, error: membershipError } = await admin.from('memberships')
      .select('role').eq('organization_id', organizationId).eq('user_id', authData.user.id).maybeSingle()
    if (membershipError || !actingMembership || !['super_admin', 'sales_manager'].includes(actingMembership.role)) {
      return respond({ error: 'You do not have permission to administer this workspace.' }, 403, origin)
    }
    const actorRole = actingMembership.role as MemberRole

    if (action === 'list') {
      const [members, audit] = await Promise.all([
        admin.from('memberships').select('user_id,role,created_at,profile:profiles(display_name,email)')
          .eq('organization_id', organizationId).order('created_at', { ascending: true }).limit(500),
        admin.from('audit_logs').select('id,actor_id,action,resource_type,resource_id,result,created_at')
          .eq('organization_id', organizationId).order('created_at', { ascending: false }).limit(50),
      ])
      if (members.error || audit.error) return respond({ error: 'Workspace members or audit history could not be loaded.' }, 503, origin)
      return respond({ members: members.data ?? [], audit: audit.data ?? [] }, 200, origin)
    }

    if (action !== 'invite') return respond({ error: 'Unsupported team action.' }, 400, origin)
    const invite = parseTeamInvite(raw)
    if (!invite) return respond({ error: 'Enter a valid email, optional display name, and supported role.' }, 400, origin)
    if (!canAssignMemberRole(actorRole, invite.role)) return respond({ error: 'Your role cannot assign that workspace role.' }, 403, origin)
    const { data: inviteCapacity, error: rateLimitError } = await admin.rpc('admin_reserve_team_invite', {
      target_organization: organizationId,
      acting_user: authData.user.id,
    })
    if (rateLimitError) return respond({ error: 'Invitation rate limit could not be checked.' }, 503, origin)
    if (!inviteCapacity) return respond({ error: 'Daily invitation limit reached. Try again tomorrow.' }, 429, origin)

    const { data: existingProfile, error: profileError } = await admin.from('profiles').select('id')
      .ilike('email', invite.email).maybeSingle()
    if (profileError) return respond({ error: 'Existing workspace user could not be checked.' }, 503, origin)

    let targetUserId: string
    let invitationSent = false
    if (existingProfile) {
      const { data: alreadyMember, error: existingMembershipError } = await admin.from('memberships').select('user_id')
        .eq('organization_id', organizationId).eq('user_id', existingProfile.id).maybeSingle()
      if (existingMembershipError) return respond({ error: 'Existing workspace access could not be checked.' }, 503, origin)
      if (alreadyMember) return respond({ error: 'This person is already a member of the workspace.' }, 409, origin)
      targetUserId = existingProfile.id
    } else {
      const { data: inviteData, error: inviteError } = await admin.auth.admin.inviteUserByEmail(invite.email, {
        data: invite.displayName ? { display_name: invite.displayName } : {},
        ...(appOrigin ? { redirectTo: appOrigin } : {}),
      })
      if (inviteError || !inviteData.user) return respond({ error: 'The invitation could not be sent. Check the Auth email configuration and whether the account already exists.' }, 502, origin)
      targetUserId = inviteData.user.id
      invitationSent = true
    }

    const { error: addError } = await admin.rpc('admin_add_org_member', {
      target_organization: organizationId,
      acting_user: authData.user.id,
      target_user: targetUserId,
      target_role: invite.role,
    })
    if (addError) {
      return respond({ error: invitationSent ? 'The invite email was sent, but workspace access could not be assigned. Retry this invite to finish the assignment.' : 'Workspace access could not be assigned.' }, 503, origin)
    }

    return respond({ ok: true, invitationSent, message: invitationSent ? 'Invitation sent and workspace access assigned.' : 'Existing user added to the workspace.' }, 200, origin)
  } catch {
    return respond({ error: 'Team administration request could not be completed.' }, 500, origin)
  }
})
