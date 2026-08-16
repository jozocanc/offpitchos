'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { type ActionResult, toActionError } from '@/lib/action-result'

// Look up a team by its invite code. Uses the service client to bypass
// RLS since this runs before the user is authenticated — they're on
// the join page and haven't signed in yet.
export async function getTeamByCode(
  ...args: Parameters<typeof _getTeamByCode>
): Promise<ActionResult<Awaited<ReturnType<typeof _getTeamByCode>>>> {
  try {
    return { ok: true, data: await _getTeamByCode(...args) }
  } catch (e) {
    return toActionError(e)
  }
}

async function _getTeamByCode(code: string) {
  const service = createServiceClient()

  const { data: team } = await service
    .from('teams')
    .select('id, name, age_group, club_id, clubs(name)')
    .eq('invite_code', code.toUpperCase())
    .single()

  if (!team) return null

  const club = Array.isArray(team.clubs) ? team.clubs[0] : team.clubs

  return {
    teamId: team.id,
    teamName: team.name,
    ageGroup: team.age_group,
    clubId: team.club_id,
    clubName: club?.name ?? 'Club',
  }
}

// Accept an invite code: creates/updates the user's profile for this club,
// adds them as a parent team_member, then redirects to the dashboard where
// the claim-your-kids modal will handle linking their specific child.
export async function acceptInviteCode(
  ...args: Parameters<typeof _acceptInviteCode>
): Promise<ActionResult<Awaited<ReturnType<typeof _acceptInviteCode>>>> {
  try {
    return { ok: true, data: await _acceptInviteCode(...args) }
  } catch (e) {
    return toActionError(e)
  }
}

// 'player' is a self-declaration, not a privilege. A player and a parent
// resolve to the same RLS (both are `parent_id = auth.uid()` on their own
// player row), so choosing the wrong one changes labels and navigation, never
// access. Defaults to 'parent' so existing youth invite links are unaffected.
type JoinRole = 'parent' | 'player'

async function _acceptInviteCode(code: string, joinAs: JoinRole = 'parent') {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const team = await _getTeamByCode(code)
  if (!team) throw new Error('Invalid invite code')

  // Upsert profile — if user already has a profile (from another club or
  // a previous incomplete signup), update it. If new, create it.
  const displayName =
    (user.user_metadata?.display_name as string) ||
    (user.user_metadata?.full_name as string) ||
    (user.user_metadata?.name as string) ||
    user.email?.split('@')[0] ||
    (joinAs === 'player' ? 'Player' : 'Parent')

  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({
      user_id: user.id,
      club_id: team.clubId,
      role: joinAs,
      display_name: displayName,
      onboarding_complete: true,
    }, { onConflict: 'user_id' })

  if (profileError) throw new Error(`Failed to create profile: ${profileError.message}`)

  // Get the profile PK for team_members
  const { data: profile } = await supabase
    .from('profiles')
    .select('id')
    .eq('user_id', user.id)
    .single()

  if (profile) {
    const { error: memberError } = await supabase
      .from('team_members')
      .upsert({
        team_id: team.teamId,
        profile_id: profile.id,
        role: joinAs,
      }, { onConflict: 'team_id,profile_id' })

    if (memberError) throw new Error(`Failed to join team: ${memberError.message}`)
  }

  revalidatePath('/dashboard')

  return { clubId: team.clubId, teamId: team.teamId, role: joinAs }
}
