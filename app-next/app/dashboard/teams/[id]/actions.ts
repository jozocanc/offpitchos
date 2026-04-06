'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

export async function generateParentInvite(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const teamId = formData.get('teamId') as string

  if (!teamId) throw new Error('Team ID is required')

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('club_id')
    .eq('user_id', user.id)
    .single()

  if (profileError || !profile?.club_id) {
    throw new Error('Could not find your club')
  }

  // Verify the team belongs to this club
  const { data: team, error: teamError } = await supabase
    .from('teams')
    .select('id')
    .eq('id', teamId)
    .eq('club_id', profile.club_id)
    .single()

  if (teamError || !team) {
    throw new Error('Team not found')
  }

  const { error } = await supabase
    .from('invites')
    .insert({
      club_id: profile.club_id,
      team_id: teamId,
      role: 'parent',
      status: 'pending',
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    })

  if (error) throw new Error(`Failed to create invite: ${error.message}`)

  revalidatePath(`/dashboard/teams/${teamId}`)
}

export async function updateTeam(teamId: string, name: string, ageGroup: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id, role')
    .eq('user_id', user.id)
    .single()

  if (profile?.role !== 'doc') throw new Error('Only DOC can edit teams')

  const { error } = await supabase
    .from('teams')
    .update({ name: name.trim(), age_group: ageGroup })
    .eq('id', teamId)
    .eq('club_id', profile.club_id)

  if (error) throw new Error(`Failed to update team: ${error.message}`)

  revalidatePath(`/dashboard/teams/${teamId}`)
  revalidatePath('/dashboard/teams')
}

export async function deleteTeam(teamId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id, role')
    .eq('user_id', user.id)
    .single()

  if (profile?.role !== 'doc') throw new Error('Only DOC can delete teams')

  // Delete team members first, then the team
  await supabase.from('team_members').delete().eq('team_id', teamId)
  await supabase.from('invites').update({ status: 'revoked' }).eq('team_id', teamId).eq('status', 'pending')

  const { error } = await supabase
    .from('teams')
    .delete()
    .eq('id', teamId)
    .eq('club_id', profile.club_id)

  if (error) throw new Error(`Failed to delete team: ${error.message}`)

  revalidatePath('/dashboard/teams')
  redirect('/dashboard/teams')
}

export async function removeMember(teamId: string, userId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id, role')
    .eq('user_id', user.id)
    .single()

  if (profile?.role !== 'doc') throw new Error('Only DOC can remove members')

  const { error } = await supabase
    .from('team_members')
    .delete()
    .eq('team_id', teamId)
    .eq('user_id', userId)

  if (error) throw new Error(`Failed to remove member: ${error.message}`)

  revalidatePath(`/dashboard/teams/${teamId}`)
}

export async function revokeParentInvite(inviteId: string, teamId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id')
    .eq('user_id', user.id)
    .single()

  if (!profile?.club_id) throw new Error('No club found')

  const { error } = await supabase
    .from('invites')
    .update({ status: 'revoked' })
    .eq('id', inviteId)
    .eq('club_id', profile.club_id)

  if (error) throw new Error(`Failed to revoke invite: ${error.message}`)

  revalidatePath(`/dashboard/teams/${teamId}`)
}
