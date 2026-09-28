'use server'

import { createClient } from '@/lib/supabase/server'
import { appUrl } from '@/lib/app-url'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { type ActionResult, toActionError } from '@/lib/action-result'
import { ROLES } from '@/lib/constants'

export async function addPlayer(
  ...args: Parameters<typeof _addPlayer>
): Promise<ActionResult<Awaited<ReturnType<typeof _addPlayer>>>> {
  try {
    return { ok: true, data: await _addPlayer(...args) }
  } catch (e) {
    return toActionError(e)
  }
}

async function _addPlayer(formData: FormData) {
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
      // Placeholder owner until the player claims the row via an invite.
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

export async function removePlayer(
  ...args: Parameters<typeof _removePlayer>
): Promise<ActionResult<Awaited<ReturnType<typeof _removePlayer>>>> {
  try {
    return { ok: true, data: await _removePlayer(...args) }
  } catch (e) {
    return toActionError(e)
  }
}

async function _removePlayer(playerId: string, teamId: string) {
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

// Link a roster row to a player account that has already joined the team.
// players.parent_id is "the account linked to this player row" (the player's
// own login). Used to fix unclaimed rows where parent_id still points at the
// DOC who added them. Exported name kept for compatibility.
// Legacy 'parent' team members are still accepted so old rows don't break.
export async function linkPlayerToParent(
  ...args: Parameters<typeof _linkPlayerToParent>
): Promise<ActionResult<Awaited<ReturnType<typeof _linkPlayerToParent>>>> {
  try {
    return { ok: true, data: await _linkPlayerToParent(...args) }
  } catch (e) {
    return toActionError(e)
  }
}

async function _linkPlayerToParent(playerId: string, accountUserId: string, teamId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id, role')
    .eq('user_id', user.id)
    .single()

  if (profile?.role !== 'doc') throw new Error('Only the DOC can link a player account')
  if (!profile.club_id) throw new Error('No club found')

  // Look up the target account's profile PK so we can query team_members by profile_id.
  const { data: accountProfile } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_id', accountUserId)
    .single()

  if (!accountProfile) throw new Error('Player account not found')

  // Verify the target account is a member (player, or legacy parent) of this team.
  const { data: targetMember } = await supabase
    .from('team_members')
    .select('profile_id, role')
    .eq('team_id', teamId)
    .eq('profile_id', accountProfile.id)
    .in('role', [ROLES.PLAYER, ROLES.PARENT])
    .single()

  if (!targetMember) throw new Error('That account is not a player on this team')

  const { error } = await supabase
    .from('players')
    .update({ parent_id: accountUserId })
    .eq('id', playerId)
    .eq('club_id', profile.club_id)

  if (error) throw new Error(`Failed to link player account: ${error.message}`)

  revalidatePath(`/dashboard/teams/${teamId}`)
}

// Generate a player-scoped invite and return the shareable URL. The player
// opens it and claims their own profile. Differs from
// `createParentInviteReturningUrl` by also stamping player_id on the invites
// row; on accept, the join RPC sets players.parent_id to the arriving
// account, so the roster row becomes that player's own login.
export async function createPlayerScopedInvite(
  ...args: Parameters<typeof _createPlayerScopedInvite>
): Promise<ActionResult<Awaited<ReturnType<typeof _createPlayerScopedInvite>>>> {
  try {
    return { ok: true, data: await _createPlayerScopedInvite(...args) }
  } catch (e) {
    return toActionError(e)
  }
}

async function _createPlayerScopedInvite(
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
  if (profile.role !== 'doc') throw new Error('Only the DOC can create player invites')

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
      role: ROLES.PLAYER,
      status: 'pending',
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select('token')
    .single()

  if (error || !invite) {
    throw new Error(`Failed to create invite: ${error?.message ?? 'unknown'}`)
  }

  revalidatePath(`/dashboard/teams/${teamId}`)

  const baseUrl = appUrl()
  return { url: `${baseUrl}/join/${invite.token}` }
}

// Generate a player invite for a team and return the shareable URL so the UI
// can copy it to clipboard right after a player is added, skipping the two-step
// "generate then find the link" dance. Exported name kept for compatibility.
export async function createParentInviteReturningUrl(
  ...args: Parameters<typeof _createParentInviteReturningUrl>
): Promise<ActionResult<Awaited<ReturnType<typeof _createParentInviteReturningUrl>>>> {
  try {
    return { ok: true, data: await _createParentInviteReturningUrl(...args) }
  } catch (e) {
    return toActionError(e)
  }
}

async function _createParentInviteReturningUrl(teamId: string): Promise<{ url: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id, role')
    .eq('user_id', user.id)
    .single()

  if (!profile?.club_id) throw new Error('No club found')
  if (profile.role !== 'doc') throw new Error('Only the DOC can create player invites')

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
      role: ROLES.PLAYER,
      status: 'pending',
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    })
    .select('token')
    .single()

  if (error || !invite) throw new Error(`Failed to create invite: ${error?.message ?? 'unknown'}`)

  revalidatePath(`/dashboard/teams/${teamId}`)

  const baseUrl = appUrl()
  return { url: `${baseUrl}/join/${invite.token}` }
}
