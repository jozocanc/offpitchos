import { cookies } from 'next/headers'
import { ROLES, type Role } from '@/lib/constants'

const VIEWABLE_ROLES: readonly string[] = [ROLES.DOC, ROLES.COACH, ROLES.PARENT]

/**
 * A DOC may preview the app as one of their own coaches or parents. Nobody
 * else can. This is a strict downgrade — a DOC already outranks both roles, so
 * the switch never grants privilege, and every write is still checked by RLS
 * against the real JWT regardless of what this returns.
 *
 * Was gated on a hardcoded admin email until 2026-08-16, which meant only Jozo
 * could use the switcher.
 */
export function canSwitchRole(actualRole: string | null | undefined): boolean {
  return actualRole === ROLES.DOC
}

export async function getEffectiveRole(actualRole: string): Promise<string> {
  if (!canSwitchRole(actualRole)) return actualRole

  const cookieStore = await cookies()
  const viewAs = cookieStore.get('viewAsRole')?.value
  if (viewAs && VIEWABLE_ROLES.includes(viewAs)) {
    return viewAs as Role
  }

  return actualRole
}
