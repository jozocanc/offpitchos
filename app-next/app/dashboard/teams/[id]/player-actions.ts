'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

export async function addPlayer(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const teamId = formData.get('teamId') as string
  const firstName = (formData.get('firstName') as string)?.trim()
  const lastName = (formData.get('lastName') as string)?.trim()
  const jerseyNumber = formData.get('jerseyNumber') as string
  const position = (formData.get('position') as string)?.trim()

  if (!firstName || !lastName) throw new Error('Name is required')

  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id')
    .eq('user_id', user.id)
    .single()

  if (!profile?.club_id) throw new Error('No club found')

  const { error } = await supabase
    .from('players')
    .insert({
      parent_id: user.id,
      team_id: teamId,
      club_id: profile.club_id,
      first_name: firstName,
      last_name: lastName,
      jersey_number: jerseyNumber ? parseInt(jerseyNumber) : null,
      position: position || null,
    })

  if (error) throw new Error(`Failed to add player: ${error.message}`)

  revalidatePath(`/dashboard/teams/${teamId}`)
}

export async function removePlayer(playerId: string, teamId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await supabase
    .from('players')
    .delete()
    .eq('id', playerId)

  if (error) throw new Error(`Failed to remove player: ${error.message}`)

  revalidatePath(`/dashboard/teams/${teamId}`)
}
