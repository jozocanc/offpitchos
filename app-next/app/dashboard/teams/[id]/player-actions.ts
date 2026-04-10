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

// Link an existing player to a parent user (one of the team's parent members).
// Used to fix "unlinked" players where parent_id currently points at the DOC who added them.
export async function linkPlayerToParent(playerId: string, parentUserId: string, teamId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id, role')
    .eq('user_id', user.id)
    .single()

  if (profile?.role !== 'doc') throw new Error('Only DOC can reassign a player parent')
  if (!profile.club_id) throw new Error('No club found')

  // Look up the target parent's profile PK so we can query team_members by profile_id.
  const { data: parentProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_id', parentUserId)
    .single()

  if (!parentProfile) throw new Error('Parent profile not found')

  // Verify the target parent is actually a parent member of this team in this club.
  const { data: targetMember } = await supabase
    .from('team_members')
    .select('profile_id, role')
    .eq('team_id', teamId)
    .eq('profile_id', parentProfile.id)
    .eq('role', 'parent')
    .single()

  if (!targetMember) throw new Error('That user is not a parent on this team')

  const { error } = await supabase
    .from('players')
    .update({ parent_id: parentUserId })
    .eq('id', playerId)
    .eq('club_id', profile.club_id)

  if (error) throw new Error(`Failed to link parent: ${error.message}`)

  revalidatePath(`/dashboard/teams/${teamId}`)
}

// Generate a player-scoped parent invite and return the shareable URL.
// Differs from `createParentInviteReturningUrl` by also stamping player_id
// on the invites row; on accept, the join action auto-claims the target
// player for the arriving parent so they don't have to run the manual
// claim-your-kids flow on the dashboard.
export async function createPlayerScopedInvite(
  playerId: string,
  teamId: string,
): Promise<{ url: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id, role')
    .eq('user_id', user.id)
    .single()

  if (!profile?.club_id) throw new Error('No club found')
  if (profile.role !== 'doc') throw new Error('Only DOC can create parent invites')

  // Verify the player belongs to the team (and the team to this club) before
  // letting the DOC attach it to an invite — stops a bad playerId from
  // smuggling a cross-team claim.
  const { data: player } = await supabase
    .from('players')
    .select('id, team_id, club_id')
    .eq('id', playerId)
    .eq('club_id', profile.club_id)
    .single()

  if (!player || player.team_id !== teamId) {
    throw new Error('Player not found on this team')
  }

  const { data: invite, error } = await supabase
    .from('invites')
    .insert({
      club_id: profile.club_id,
      team_id: teamId,
      player_id: playerId,
      role: 'parent',
      status: 'pending',
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select('token')
    .single()

  if (error || !invite) {
    throw new Error(`Failed to create invite: ${error?.message ?? 'unknown'}`)
  }

  revalidatePath(`/dashboard/teams/${teamId}`)

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  return { url: `${baseUrl}/join/${invite.token}` }
}

// Generate a parent invite for a team and return the shareable URL so the UI
// can copy it to clipboard right after a player is added, skipping the two-step
// "generate then find the link" dance.
export async function createParentInviteReturningUrl(teamId: string): Promise<{ url: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id, role')
    .eq('user_id', user.id)
    .single()

  if (!profile?.club_id) throw new Error('No club found')
  if (profile.role !== 'doc') throw new Error('Only DOC can create parent invites')

  const { data: team } = await supabase
    .from('teams')
    .select('id')
    .eq('id', teamId)
    .eq('club_id', profile.club_id)
    .single()

  if (!team) throw new Error('Team not found')

  const { data: invite, error } = await supabase
    .from('invites')
    .insert({
      club_id: profile.club_id,
      team_id: teamId,
      role: 'parent',
      status: 'pending',
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select('token')
    .single()

  if (error || !invite) throw new Error(`Failed to create invite: ${error?.message ?? 'unknown'}`)

  revalidatePath(`/dashboard/teams/${teamId}`)

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
  return { url: `${baseUrl}/join/${invite.token}` }
}
