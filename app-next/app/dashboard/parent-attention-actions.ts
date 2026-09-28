'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { type ActionResult, toActionError } from '@/lib/action-result'
import { isMember } from '@/lib/constants'
import { getClubTimezone } from '@/lib/club-timezone-server'
import { formatShortDate } from '@/lib/format-datetime'

// Player-scoped prioritization. Mirrors the DOC and coach attention panels
// but keyed off the player's own roster row rather than team-wide state.
// (File and export names still say "parent" for historical reasons; the
// product is team-only now and this panel is the player's.)
//
// "Linked" means players.parent_id = this user's auth id: the column name is
// legacy, it now just means "the account linked to this player row". When a
// player first joins, only the claim_kids ("find yourself on the roster")
// signal fires; once they link their row, the rest unlock automatically.

export type ParentSignalType =
  | 'claim_kids'
  | 'rsvp_needed'
  | 'missing_sizes'
  | 'unpaid_camps'
  | 'new_feedback'

export interface ParentSignal {
  id: string
  type: ParentSignalType
  title: string
  subtitle: string
  urgency: 'critical' | 'important' | 'routine'
  href: string
}

export interface ClaimablePlayer {
  id: string
  firstName: string
  lastName: string
  teamName: string
  jerseyNumber: number | null
}

export interface ClaimedKid {
  id: string
  firstName: string
  lastName: string
  jerseyNumber: number | null
  teamName: string
  ageGroup: string | null
}

export interface ParentAttentionResult {
  signals: ParentSignal[]
  claimable: ClaimablePlayer[]
  claimedKids: ClaimedKid[]
  generatedAt: string
}

async function getParentContext() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, club_id, role')
    .eq('user_id', user.id)
    .single()

  if (!profile?.club_id) throw new Error('No club found')
  return { user, profile, supabase }
}

export async function getParentAttention(): Promise<ParentAttentionResult> {
  const { user, profile, supabase } = await getParentContext()

  // Teams this player is a member of. Used both to scope the claim flow
  // (only show roster rows on teams they belong to) and to key downstream
  // signals. 'parent' is a legacy member role, still accepted.
  const { data: memberships } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('profile_id', profile.id)
    .in('role', ['player', 'parent'])

  const teamIds = (memberships ?? []).map(m => m.team_id)

  if (teamIds.length === 0) {
    return {
      signals: [],
      claimable: [],
      claimedKids: [],
      generatedAt: new Date().toISOString(),
    }
  }

  // Pull every player on the viewer's teams in a single round trip; we'll
  // split them into "me" vs "unclaimed" below. `teams` is a
  // joined relation and comes back either as a single object or an array
  // depending on Supabase version — we normalize with Array.isArray.
  const { data: teamPlayers } = await supabase
    .from('players')
    .select('id, first_name, last_name, jersey_number, parent_id, jersey_size, shorts_size, team_id, teams(name, age_group)')
    .in('team_id', teamIds)
    .order('last_name', { ascending: true })

  type PlayerRow = {
    id: string
    first_name: string
    last_name: string
    jersey_number: number | null
    parent_id: string
    jersey_size: string | null
    shorts_size: string | null
    team_id: string
    teams: { name: string; age_group: string } | { name: string; age_group: string }[] | null
  }

  const players = (teamPlayers ?? []) as PlayerRow[]

  // The roster row(s) already linked to this account. Normally exactly one.
  const myPlayers = players.filter(p => p.parent_id === user.id)

  // Which rows on their team are still "unclaimed", i.e. parent_id does not
  // resolve to a member (player) account? Unclaimed rows point at whoever
  // created them, usually the DOC. We check profile role rather than just
  // "not me" so we never offer a row a teammate has already linked.
  // Service client: members can't necessarily read teammates' profiles, and
  // a silently empty read here would offer every row as claimable.
  let claimable: ClaimablePlayer[] = []
  const candidateOwnerIds = Array.from(
    new Set(players.filter(p => p.parent_id !== user.id).map(p => p.parent_id)),
  )

  if (candidateOwnerIds.length > 0) {
    const { data: candidateProfiles } = await createServiceClient()
      .from('profiles')
      .select('user_id, role')
      .in('user_id', candidateOwnerIds)

    const linkedUserIds = new Set(
      (candidateProfiles ?? [])
        .filter(p => isMember(p.role))
        .map(p => p.user_id as string),
    )

    const unclaimedPlayers = players.filter(
      p => p.parent_id !== user.id && !linkedUserIds.has(p.parent_id),
    )

    claimable = unclaimedPlayers.map(p => {
      const team = Array.isArray(p.teams) ? p.teams[0] : p.teams
      return {
        id: p.id,
        firstName: p.first_name,
        lastName: p.last_name,
        jerseyNumber: p.jersey_number,
        teamName: team?.name ?? 'Team',
      }
    })
  }

  const signals: ParentSignal[] = []

  // --- Signal 1: Find yourself on the roster ---------------------------
  // Only while this account has NO linked row. Once they've linked theirs,
  // the remaining unlinked rows belong to teammates, not to them.
  if (claimable.length > 0 && myPlayers.length === 0) {
    signals.push({
      id: `claim:${profile.id}`,
      type: 'claim_kids',
      title: 'Find yourself on the roster',
      subtitle: 'Link your account to your roster spot so you get your reminders and coach feedback.',
      urgency: 'critical',
      href: '/dashboard?claim=1',
    })
  }

  // --- Signal 2: RSVP for upcoming sessions ----------------------------
  // Sessions in the next 7 days on the player's team that they haven't
  // answered yet. One signal per session, capped so a busy week doesn't
  // bury everything else.
  if (myPlayers.length > 0) {
    const nowIso = new Date().toISOString()
    const weekOut = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    const myTeamIds = Array.from(new Set(myPlayers.map(p => p.team_id)))
    const myPlayerIds = myPlayers.map(p => p.id)

    const { data: upcoming } = await supabase
      .from('events')
      .select('id, title, start_time, status, team_id')
      .in('team_id', myTeamIds)
      .gte('start_time', nowIso)
      .lte('start_time', weekOut)
      .neq('status', 'cancelled')
      .order('start_time', { ascending: true })
      .limit(10)

    const upcomingEvents = upcoming ?? []
    if (upcomingEvents.length > 0) {
      const timezone = await getClubTimezone()
      const { data: rsvps } = await supabase
        .from('event_rsvps')
        .select('event_id, player_id')
        .in('event_id', upcomingEvents.map(e => e.id))
        .in('player_id', myPlayerIds)

      const answered = new Set((rsvps ?? []).map(r => `${r.event_id}:${r.player_id}`))
      let added = 0
      for (const ev of upcomingEvents) {
        if (added >= 3) break
        const me = myPlayers.find(p => p.team_id === ev.team_id)
        if (!me || answered.has(`${ev.id}:${me.id}`)) continue
        const when = formatShortDate(ev.start_time, timezone)
        signals.push({
          id: `rsvp:${ev.id}`,
          type: 'rsvp_needed',
          title: `Are you in for ${ev.title ?? 'the session'}?`,
          subtitle: `${when}. Let your coaches know if you're going.`,
          urgency: 'important',
          href: '/dashboard/schedule',
        })
        added++
      }
    }
  }

  // --- Signal 3: Missing gear sizes ------------------------------------
  for (const p of myPlayers) {
    if (p.jersey_size && p.shorts_size) continue
    signals.push({
      id: `sizes:${p.id}`,
      type: 'missing_sizes',
      title: 'Submit your gear sizes',
      subtitle: 'Your coaches need your jersey and shorts sizes to place the team order.',
      urgency: 'important',
      href: `/dashboard/players/${p.id}`,
    })
  }

  // --- Signal 4: Unpaid camps ------------------------------------------
  if (myPlayers.length > 0) {
    const { data: regs } = await supabase
      .from('camp_registrations')
      .select('id, payment_status, camp_detail_id, player_id, camp_details(event_id, fee_cents, events(title, start_time))')
      .in('player_id', myPlayers.map(p => p.id))
      .eq('payment_status', 'unpaid')

    type RegRow = {
      id: string
      player_id: string
      camp_details:
        | {
            event_id: string
            fee_cents: number
            events: { title: string; start_time: string } | { title: string; start_time: string }[] | null
          }
        | { event_id: string; fee_cents: number; events: unknown }[]
        | null
    }

    for (const regRaw of (regs ?? []) as unknown as RegRow[]) {
      const detail = Array.isArray(regRaw.camp_details) ? regRaw.camp_details[0] : regRaw.camp_details
      if (!detail) continue
      const ev = Array.isArray(detail.events) ? detail.events[0] : detail.events
      const title = (ev as { title?: string } | null)?.title ?? 'a camp'
      const fee = detail.fee_cents > 0 ? ` ($${(detail.fee_cents / 100).toFixed(2)})` : ''
      signals.push({
        id: `camp:${regRaw.id}`,
        type: 'unpaid_camps',
        title: `Pay ${title}${fee}`,
        subtitle: 'Outstanding camp fee. Tap to pay.',
        urgency: 'important',
        href: '/dashboard/camps',
      })
    }
  }

  // --- Signal 5: New coach feedback in the last 7 days -----------------
  if (myPlayers.length > 0) {
    const nowDate = new Date()
    const sevenDaysAgo = new Date(nowDate.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: feedbackRows } = await supabase
      .from('player_feedback')
      .select('id, player_id, category, notes, created_at')
      .in('player_id', myPlayers.map(p => p.id))
      .gte('created_at', sevenDaysAgo)
      .order('created_at', { ascending: false })
      .limit(10)

    const seenPerPlayer = new Map<string, number>()
    for (const fb of feedbackRows ?? []) {
      const count = (seenPerPlayer.get(fb.player_id) ?? 0) + 1
      seenPerPlayer.set(fb.player_id, count)
    }

    for (const [playerId, count] of seenPerPlayer.entries()) {
      if (!myPlayers.some(p => p.id === playerId)) continue
      signals.push({
        id: `feedback:${playerId}`,
        type: 'new_feedback',
        title: `${count} new coach note${count === 1 ? '' : 's'} for you`,
        subtitle: 'Your coach added feedback this week. Tap to read.',
        urgency: 'routine',
        href: `/dashboard/players/${playerId}`,
      })
    }
  }

  const claimedKids: ClaimedKid[] = myPlayers.map(p => {
    const team = Array.isArray(p.teams) ? p.teams[0] : p.teams
    return {
      id: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      jerseyNumber: p.jersey_number,
      teamName: team?.name ?? 'Team',
      ageGroup: team?.age_group ?? null,
    }
  })

  return {
    signals,
    claimable,
    claimedKids,
    generatedAt: new Date().toISOString(),
  }
}

/**
 * Link the caller's account to their own roster row ("this is me"). Takes an
 * array for signature compatibility but a player links exactly one row.
 * Validates that the target is on a team the caller is a member of, that the
 * caller isn't already linked, and refuses to overwrite a row a teammate has
 * already linked, before flipping `players.parent_id` to the caller's auth id.
 */
export async function claimPlayers(
  ...args: Parameters<typeof _claimPlayers>
): Promise<ActionResult<Awaited<ReturnType<typeof _claimPlayers>>>> {
  try {
    return { ok: true, data: await _claimPlayers(...args) }
  } catch (e) {
    return toActionError(e)
  }
}

async function _claimPlayers(playerIds: string[]): Promise<{
  claimed: number
  skipped: number
}> {
  const { user, profile, supabase } = await getParentContext()
  if (!isMember(profile.role)) throw new Error('Only players can link a roster spot')
  if (playerIds.length === 0) return { claimed: 0, skipped: 0 }
  if (playerIds.length > 1) throw new Error('Pick just one roster spot: yours')

  // Already linked? A player owns one row; relinking goes through staff.
  const { data: alreadyMine } = await supabase
    .from('players')
    .select('id')
    .eq('parent_id', user.id)
    .limit(1)
  if (alreadyMine && alreadyMine.length > 0) {
    throw new Error('Your account is already linked to a roster spot. Ask your coach to change it.')
  }

  // Teams this player is a member of. Scopes which rows they can claim.
  const { data: memberships } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('profile_id', profile.id)
    .in('role', ['player', 'parent'])

  const allowedTeamIds = new Set((memberships ?? []).map(m => m.team_id))
  if (allowedTeamIds.size === 0) throw new Error('You are not on any team yet')

  // Load the target players so we can verify team membership + check their
  // current parent_id before overwriting. Service client: a member can only
  // read rows they already own (players_parent_own), so a user-scoped read of
  // an unclaimed row always came back empty. allowedTeamIds scopes it below.
  const service = createServiceClient()
  const { data: targetPlayers } = await service
    .from('players')
    .select('id, team_id, parent_id')
    .in('id', playerIds)

  if (!targetPlayers || targetPlayers.length === 0) {
    return { claimed: 0, skipped: playerIds.length }
  }

  // Resolve current parent_ids (linked accounts) to profiles so we skip any
  // row a teammate has already linked.
  const existingOwnerIds = Array.from(
    new Set(targetPlayers.map(p => p.parent_id).filter(id => id && id !== user.id)),
  )
  const lockedUserIds = new Set<string>()
  if (existingOwnerIds.length > 0) {
    const { data: lockedProfiles } = await service
      .from('profiles')
      .select('user_id, role')
      .in('user_id', existingOwnerIds)
    for (const p of lockedProfiles ?? []) {
      if (isMember(p.role)) lockedUserIds.add(p.user_id as string)
    }
  }

  const claimable = targetPlayers.filter(p => {
    if (!allowedTeamIds.has(p.team_id)) return false
    if (p.parent_id === user.id) return false
    if (lockedUserIds.has(p.parent_id)) return false
    return true
  })

  if (claimable.length === 0) {
    return { claimed: 0, skipped: targetPlayers.length }
  }

  // Service client for the write: the only member policy on players is
  // players_parent_own (parent_id = auth.uid()), which is false until AFTER
  // the claim, so a user-scoped UPDATE matched zero rows and silently did
  // nothing. Every check above already ran as the caller.
  const { data: updated, error } = await service
    .from('players')
    .update({ parent_id: user.id })
    .in('id', claimable.map(p => p.id))
    .select('id')

  if (error) throw new Error(`Failed to link roster spot: ${error.message}`)
  const claimedCount = updated?.length ?? 0

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/teams')

  return {
    claimed: claimedCount,
    skipped: targetPlayers.length - claimedCount,
  }
}
