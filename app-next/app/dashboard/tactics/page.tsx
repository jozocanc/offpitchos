import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listDrills } from './actions'
import LibraryClient from './library-client'

export default async function TacticsLibraryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/access')
  const { data: profile } = await supabase
    .from('profiles').select('id, role, club_id').eq('user_id', user.id).single()
  if (!profile?.club_id) redirect('/onboarding')
  if (profile.role !== 'doc' && profile.role !== 'coach') redirect('/dashboard')

  const drills = await listDrills()
  const { data: teams } = await supabase
    .from('teams').select('id, name').eq('club_id', profile.club_id).order('name')

  return <LibraryClient drills={drills} teams={teams ?? []} role={profile.role} currentProfileId={profile.id} />
}
