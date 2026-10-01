import { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getEffectiveRole } from '@/lib/admin-role'
import { getCampsData } from './actions'
import CampsClient from './camps-client'

export const metadata: Metadata = {
  title: 'Camps',
}

export default async function CampsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: prof } = await supabase.from('profiles').select('role').eq('user_id', user.id).single()
  const role = await getEffectiveRole(prof?.role ?? 'player')
  if (role !== 'doc') redirect('/dashboard')

  const { camps, userRole, userProfileId, teams, venues } = await getCampsData()

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-black tracking-tight">Camps</h1>
        <p className="text-sm text-gray mt-1">Manage camps, registrations, and revenue.</p>
      </div>

      <CampsClient
        camps={camps}
        userRole={userRole}
        userProfileId={userProfileId}
        teams={teams}
        venues={venues}
      />
    </div>
  )
}
