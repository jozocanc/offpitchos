import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { getAuthUserId, getCurrentProfile } from '@/lib/current-profile'
import { getEffectiveRole } from '@/lib/admin-role'
import { isStaff } from '@/lib/constants'
import { getReadinessData } from './data'
import ReadinessClient from './readiness-client'

export const metadata: Metadata = { title: 'Readiness' }

export default async function ReadinessPage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string; date?: string }>
}) {
  // Request-memoized claims + profile, shared with getReadinessData().
  if (!(await getAuthUserId())) redirect('/login')
  const prof = await getCurrentProfile()
  // "View as Player" resolves to 'player' here, so the preview is bounced
  // like every other staff page.
  const role = await getEffectiveRole(prof?.role ?? 'player')
  if (!isStaff(role)) redirect('/dashboard')

  const { team, date } = await searchParams
  const data = await getReadinessData({ team, date })

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Readiness</h1>
        <p className="text-sm text-gray mt-1">
          Daily player check-ins: sleep, soreness, energy and availability, plus who you can pick for the next game.
        </p>
      </div>

      <ReadinessClient data={data} />
    </div>
  )
}
