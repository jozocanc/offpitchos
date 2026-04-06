import { cookies } from 'next/headers'

const ADMIN_EMAIL = 'jozo.cancar27@gmail.com'

export async function getEffectiveRole(userEmail: string, actualRole: string): Promise<string> {
  if (userEmail !== ADMIN_EMAIL) return actualRole

  const cookieStore = await cookies()
  const viewAs = cookieStore.get('viewAsRole')?.value
  if (viewAs && ['doc', 'coach', 'parent'].includes(viewAs)) {
    return viewAs
  }

  return actualRole
}
