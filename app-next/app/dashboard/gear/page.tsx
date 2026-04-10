import { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getEffectiveRole } from '@/lib/admin-role'
import { getGearData } from './actions'
import GearClient from './gear-client'

export const metadata: Metadata = {
  title: 'Gear',
}

export default async function GearPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: prof } = await supabase.from('profiles').select('role').eq('user_id', user.id).single()
  const role = await getEffectiveRole(user.email ?? '', prof?.role ?? 'parent')
  if (role !== 'doc') redirect('/dashboard')

  const { teams, userRole, lastRequestedAt, lastRequestedParentCount, respondedSinceRequest } = await getGearData()

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Gear</h1>
        <p className="text-sm text-gray mt-1">Player sizes and gear order summaries.</p>
      </div>

      <GearClient
        teams={teams}
        userRole={userRole}
        lastRequestedAt={lastRequestedAt}
        lastRequestedParentCount={lastRequestedParentCount}
        respondedSinceRequest={respondedSinceRequest}
      />
    </div>
  )
}
