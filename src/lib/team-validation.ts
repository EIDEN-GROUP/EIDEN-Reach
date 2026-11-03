export const memberRoles = ['super_admin', 'sales_manager', 'sales_representative', 'analyst'] as const
export type MemberRole = typeof memberRoles[number]

export type TeamInviteInput = { email: string; displayName: string | null; role: MemberRole }

export function parseTeamInvite(value: unknown): TeamInviteInput | null {
  if (!value || typeof value !== 'object') return null
  const input = value as Record<string, unknown>
  if (typeof input.email !== 'string' || input.email.length > 320) return null
  const email = input.email.trim().toLowerCase()
  if (!/^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(email)) return null
  if (typeof input.role !== 'string' || !memberRoles.includes(input.role as MemberRole)) return null
  const displayName = typeof input.displayName === 'string' ? input.displayName.trim() : ''
  if (displayName.length > 120) return null
  return { email, displayName: displayName || null, role: input.role as MemberRole }
}

export function canAssignMemberRole(actorRole: MemberRole, targetRole: MemberRole) {
  if (actorRole === 'super_admin') return true
  return actorRole === 'sales_manager' && (targetRole === 'sales_representative' || targetRole === 'analyst')
}
