import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { isStaff } from '@/lib/constants'
import ScheduleImport from './schedule-import'

export const metadata: Metadata = { title: 'Schedule Import' }

export default async function ScheduleImportPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id, role')
    .eq('user_id', user.id)
    .single()
  if (!profile?.club_id || !isStaff(profile.role)) redirect('/dashboard/schedule')

  const { data: teams } = await supabase
    .from('teams')
    .select('id, name')
    .eq('club_id', profile.club_id)
    .order('created_at')

  return (
    <div className="p-4 md:p-10 max-w-6xl mx-auto">
      <div className="mb-6 md:mb-8">
        <h1 className="text-3xl font-black tracking-tight">Schedule Import</h1>
        <p className="text-gray text-sm mt-1">Bring in your games and practices from whatever schedule file you already have.</p>
      </div>
      <ScheduleImport teams={teams ?? []} />
    </div>
  )
}
