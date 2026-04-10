'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

// Parent-scoped prioritization. Mirrors the DOC and coach attention panels
// but keyed off "the kids this parent has claimed" rather than club-wide
// state. When a parent first joins, only the claim_kids signal fires; once
// they link their children, the rest unlock automatically.

export type ParentSignalType =
  | 'claim_kids'
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

  // Teams this parent is a member of. Used both to scope the claim flow
  // (only show kids on teams they belong to) and to key downstream signals.
  const { data: memberships } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('user_id', user.id)
    .eq('role', 'parent')

  const teamIds = (memberships ?? []).map(m => m.team_id)

  if (teamIds.length === 0) {
    return {
      signals: [],
      claimable: [],
      claimedKids: [],
      generatedAt: new Date().toISOString(),
    }
  }

  // Pull every player on the parent's teams in a single round trip; we'll
  // split them into "mine" vs "unclaimed" on the client side. `teams` is a
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

  // Which players already belong to this parent?
  const myPlayers = players.filter(p => p.parent_id === user.id)

  // Which players on their team are still "unclaimed" — i.e. parent_id does
  // not resolve to a real parent profile? We check profile role rather than
  // just "not me" so that we don't try to reassign a kid a different parent
  // has already claimed.
  let claimable: ClaimablePlayer[] = []
  const candidateParentIds = Array.from(
    new Set(players.filter(p => p.parent_id !== user.id).map(p => p.parent_id)),
  )

  if (candidateParentIds.length > 0) {
    const { data: candidateProfiles } = await supabase
      .from('profiles')
      .select('user_id, role')
      .in('user_id', candidateParentIds)

    const realParentUserIds = new Set(
      (candidateProfiles ?? [])
        .filter(p => p.role === 'parent')
        .map(p => p.user_id as string),
    )

    const unclaimedPlayers = players.filter(
      p => p.parent_id !== user.id && !realParentUserIds.has(p.parent_id),
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

  // --- Signal 1: Claim your kids ----------------------------------------
  if (claimable.length > 0) {
    signals.push({
      id: `claim:${profile.id}`,
      type: 'claim_kids',
      title:
        claimable.length === 1
          ? 'Claim your child'
          : `Claim your children (${claimable.length} unlinked)`,
      subtitle: 'Link your family to the right player so we can send the right reminders.',
      urgency: 'critical',
      href: '/dashboard?claim=1',
    })
  }

  // --- Signal 2: Missing gear sizes for claimed kids --------------------
  for (const p of myPlayers) {
    if (p.jersey_size && p.shorts_size) continue
    signals.push({
      id: `sizes:${p.id}`,
      type: 'missing_sizes',
      title: `Submit gear sizes for ${p.first_name}`,
      subtitle: 'Your director needs jersey and shorts sizes to place the club order.',
      urgency: 'important',
      href: `/dashboard/players/${p.id}`,
    })
  }

  // --- Signal 3: Unpaid camps for claimed kids --------------------------
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
      const kid = myPlayers.find(p => p.id === regRaw.player_id)
      const kidLabel = kid ? ` for ${kid.first_name}` : ''
      signals.push({
        id: `camp:${regRaw.id}`,
        type: 'unpaid_camps',
        title: `Pay ${title}${kidLabel}${fee}`,
        subtitle: 'Outstanding camp fee — tap to pay.',
        urgency: 'important',
        href: '/dashboard/camps',
      })
    }
  }

  // --- Signal 4: New feedback in the last 7 days on claimed kids --------
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

    const seenPerKid = new Map<string, number>()
    for (const fb of feedbackRows ?? []) {
      const count = (seenPerKid.get(fb.player_id) ?? 0) + 1
      seenPerKid.set(fb.player_id, count)
    }

    for (const [kidId, count] of seenPerKid.entries()) {
      const kid = myPlayers.find(p => p.id === kidId)
      if (!kid) continue
      signals.push({
        id: `feedback:${kidId}`,
        type: 'new_feedback',
        title: `${count} new note${count === 1 ? '' : 's'} about ${kid.first_name}`,
        subtitle: 'Coach added feedback this week — tap to read.',
        urgency: 'routine',
        href: `/dashboard/players/${kidId}`,
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
 * Claim one or more players as your children. Validates that each target
 * player is on a team the current user is a `role='parent'` member of before
 * flipping `players.parent_id` to the caller's auth user id. Refuses to
 * overwrite a link that already points at a different real parent.
 */
export async function claimPlayers(playerIds: string[]): Promise<{
  claimed: number
  skipped: number
}> {
  const { user, profile, supabase } = await getParentContext()
  if (profile.role !== 'parent') throw new Error('Only parents can claim players')
  if (playerIds.length === 0) return { claimed: 0, skipped: 0 }

  // Teams this parent is a member of — scopes which players they can claim.
  const { data: memberships } = await supabase
    .from('team_members')
    .select('team_id')
    .eq('user_id', user.id)
    .eq('role', 'parent')

  const allowedTeamIds = new Set((memberships ?? []).map(m => m.team_id))
  if (allowedTeamIds.size === 0) throw new Error('You are not on any team yet')

  // Load the target players so we can verify team membership + check their
  // current parent_id before overwriting.
  const { data: targetPlayers } = await supabase
    .from('players')
    .select('id, team_id, parent_id')
    .in('id', playerIds)

  if (!targetPlayers || targetPlayers.length === 0) {
    return { claimed: 0, skipped: playerIds.length }
  }

  // Resolve current parent_ids to profiles so we know whether to skip any
  // that already belong to a different real parent.
  const existingParentIds = Array.from(
    new Set(targetPlayers.map(p => p.parent_id).filter(id => id && id !== user.id)),
  )
  const lockedUserIds = new Set<string>()
  if (existingParentIds.length > 0) {
    const { data: lockedProfiles } = await supabase
      .from('profiles')
      .select('user_id, role')
      .in('user_id', existingParentIds)
    for (const p of lockedProfiles ?? []) {
      if (p.role === 'parent') lockedUserIds.add(p.user_id as string)
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

  const { error } = await supabase
    .from('players')
    .update({ parent_id: user.id })
    .in('id', claimable.map(p => p.id))

  if (error) throw new Error(`Failed to claim players: ${error.message}`)

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/teams')

  return {
    claimed: claimable.length,
    skipped: targetPlayers.length - claimable.length,
  }
}
