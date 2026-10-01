import { Metadata } from 'next'
import { getAuthUserId, getCurrentProfile } from '@/lib/current-profile'
import { redirect } from 'next/navigation'
import { getEffectiveRole } from '@/lib/admin-role'
import { getGearData } from './actions'
import GearClient from './gear-client'

export const metadata: Metadata = {
  title: 'Gear',
}

export default async function GearPage() {
  // Request-memoized claims + profile, shared with getGearData().
  if (!(await getAuthUserId())) redirect('/login')
  const prof = await getCurrentProfile()
  const role = await getEffectiveRole(prof?.role ?? 'player')
  if (role !== 'doc') redirect('/dashboard')

  const { teams, userRole, lastRequestedAt, lastRequestedPlayerCount, respondedSinceRequest, playersWithAccounts } = await getGearData()

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-black tracking-tight">Gear</h1>
        <p className="text-sm text-gray mt-1">Collect jersey and shorts sizes from your players, then copy a ready-to-send kit order.</p>
      </div>

      <GearClient
        teams={teams}
        userRole={userRole}
        lastRequestedAt={lastRequestedAt}
        lastRequestedPlayerCount={lastRequestedPlayerCount}
        respondedSinceRequest={respondedSinceRequest}
        playersWithAccounts={playersWithAccounts}
      />
    </div>
  )
}
