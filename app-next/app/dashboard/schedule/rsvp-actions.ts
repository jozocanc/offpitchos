'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { sendPushToProfiles } from '@/lib/push'
import { type ActionResult, toActionError } from '@/lib/action-result'
import { getViewerIdentity, assertNotPreview } from '@/lib/admin-role'

// Player-driven RSVP. Lives in its own table (event_rsvps) so the
// attendance table remains the coach's source of truth: a player
// saying "I'll be there" never overwrites a coach's mark.
// players.parent_id is the account linked to a player row (the player's
// own login), so "my players" below is normally exactly one row.

export type RsvpResponse = 'going' | 'not_going'

export interface RsvpTally {
  going: number
  notGoing: number
  totalKids: number
}

export async function getMyKidsOnTeamForRsvp(
  ...args: Parameters<typeof _getMyKidsOnTeamForRsvp>
): Promise<ActionResult<Awaited<ReturnType<typeof _getMyKidsOnTeamForRsvp>>>> {
  try {
    return { ok: true, data: await _getMyKidsOnTeamForRsvp(...args) }
  } catch (e) {
    return toActionError(e)
  }
}

async function _getMyKidsOnTeamForRsvp(teamId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  // Sample player's id in "View as → Player" preview, else the caller's.
  const viewer = await getViewerIdentity()

  const { data: players } = await supabase
    .from('players')
    .select('id, first_name, last_name, jersey_number')
    .eq('team_id', teamId)
    .eq('parent_id', viewer.userId)
    .order('last_name')

  return players ?? []
}

// Returns the current viewer's RSVPs for the given (event, player) pairs
// so the modal can preselect the existing answer instead of erasing it.
export async function getMyExistingRsvps(
  ...args: Parameters<typeof _getMyExistingRsvps>
): Promise<ActionResult<Awaited<ReturnType<typeof _getMyExistingRsvps>>>> {
  try {
    return { ok: true, data: await _getMyExistingRsvps(...args) }
  } catch (e) {
    return toActionError(e)
  }
}

async function _getMyExistingRsvps(eventId: string, playerIds: string[]) {
  if (playerIds.length === 0) return {}
  const supabase = await createClient()
  const { data } = await supabase
    .from('event_rsvps')
    .select('player_id, response')
    .eq('event_id', eventId)
    .in('player_id', playerIds)

  const map: Record<string, RsvpResponse> = {}
  for (const row of data ?? []) {
    map[row.player_id] = row.response as RsvpResponse
  }
  return map
}

// The viewer's own answer per event, for painting "You're going" / "You
// can't make it" on each schedule card. Also returns the viewer's linked
// player ids per team so a one-tap RSVP needs no extra lookup. Read-only.
// An event_rsvps row wins; with no row, an 'excused' attendance mark (the
// can't-make-it flow writes one) reads as not going.
export interface MyRsvpState {
  responses: Record<string, RsvpResponse>
  playersByTeam: Record<string, string[]>
}

export async function getMyRsvpState(
  ...args: Parameters<typeof _getMyRsvpState>
): Promise<ActionResult<MyRsvpState>> {
  try {
    return { ok: true, data: await _getMyRsvpState(...args) }
  } catch (e) {
    return toActionError(e)
  }
}

async function _getMyRsvpState(eventIds: string[]): Promise<MyRsvpState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const viewer = await getViewerIdentity()

  const { data: players } = await supabase
    .from('players')
    .select('id, team_id')
    .eq('parent_id', viewer.userId)

  const playersByTeam: Record<string, string[]> = {}
  for (const p of players ?? []) {
    if (!p.team_id) continue
    ;(playersByTeam[p.team_id] ??= []).push(p.id)
  }
  const playerIds = (players ?? []).map(p => p.id)
  const responses: Record<string, RsvpResponse> = {}
  if (playerIds.length === 0 || eventIds.length === 0) return { responses, playersByTeam }

  const [{ data: rsvps }, { data: excused }] = await Promise.all([
    supabase
      .from('event_rsvps')
      .select('event_id, response')
      .in('event_id', eventIds)
      .in('player_id', playerIds),
    supabase
      .from('attendance')
      .select('event_id')
      .eq('status', 'excused')
      .in('event_id', eventIds)
      .in('player_id', playerIds),
  ])

  for (const row of excused ?? []) responses[row.event_id] = 'not_going'
  for (const row of rsvps ?? []) responses[row.event_id] = row.response as RsvpResponse
  return { responses, playersByTeam }
}

export async function parentRsvp(
  ...args: Parameters<typeof _parentRsvp>
): Promise<ActionResult<Awaited<ReturnType<typeof _parentRsvp>>>> {
  try {
    return { ok: true, data: await _parentRsvp(...args) }
  } catch (e) {
    return toActionError(e)
  }
}

async function _parentRsvp(input: {
  eventId: string
  teamId: string
  playerIds: string[]
  response: RsvpResponse
}): Promise<{ saved: number; notifiedCoaches: number }> {
  await assertNotPreview()
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  if (input.playerIds.length === 0) throw new Error('Select at least one player')

  // RLS will already block someone else's player row, but verify owner-up-front
  // so we can give a clean error message instead of a silent zero-row write.
  const { data: ownedPlayers } = await supabase
    .from('players')
    .select('id, first_name, last_name')
    .eq('parent_id', user.id)
    .eq('team_id', input.teamId)
    .in('id', input.playerIds)

  if (!ownedPlayers || ownedPlayers.length === 0) {
    throw new Error('That player is not linked to your account on this team')
  }

  const records = ownedPlayers.map(p => ({
    event_id: input.eventId,
    player_id: p.id,
    response: input.response,
    responded_by: user.id,
  }))

  const { error } = await supabase
    .from('event_rsvps')
    .upsert(records, { onConflict: 'event_id,player_id' })

  if (error) throw new Error(`Failed to save RSVP: ${error.message}`)

  // Coaches get a quiet push with the headline so they can adjust the
  // session plan. We don't email, that would spam coaches with one
  // mail per player confirmation.
  let notifiedCoaches = 0
  if (input.response === 'going') {
    const service = createServiceClient()

    // Switching back to "going" after "can't make it": the excuse flow wrote
    // an 'excused' attendance mark, which would keep showing E to the coach.
    // Only that self-reported mark is cleared; a coach's present/absent/late
    // stays. Service client because players have no delete policy on
    // attendance; ownership of these rows was checked above.
    await service
      .from('attendance')
      .delete()
      .eq('event_id', input.eventId)
      .in('player_id', ownedPlayers.map(p => p.id))
      .eq('status', 'excused')
    const { data: event } = await service
      .from('events')
      .select('title')
      .eq('id', input.eventId)
      .single()

    const { data: coaches } = await service
      .from('team_members')
      .select('profile_id')
      .eq('team_id', input.teamId)
      .eq('role', 'coach')

    const coachIds = (coaches ?? []).map(c => c.profile_id)
    if (coachIds.length > 0) {
      const playerNames = ownedPlayers.map(p => p.first_name).join(' & ')
      await sendPushToProfiles(coachIds, {
        title: 'OffPitchOS',
        message: `${playerNames} confirmed for ${event?.title ?? 'an event'}`,
        url: '/dashboard/schedule',
        tag: 'rsvp_going',
      })
      notifiedCoaches = coachIds.length
    }
  }

  revalidatePath('/dashboard/schedule')
  return { saved: ownedPlayers.length, notifiedCoaches }
}

// Bulk-load RSVP tallies for a list of events. Used by the schedule page
// to render forecast counts on each event card without N+1 queries.
export async function getRsvpTalliesForEvents(
  ...args: Parameters<typeof _getRsvpTalliesForEvents>
): Promise<ActionResult<Awaited<ReturnType<typeof _getRsvpTalliesForEvents>>>> {
  try {
    return { ok: true, data: await _getRsvpTalliesForEvents(...args) }
  } catch (e) {
    return toActionError(e)
  }
}

async function _getRsvpTalliesForEvents(eventIds: string[]): Promise<Record<string, RsvpTally>> {
  if (eventIds.length === 0) return {}
  const supabase = await createClient()

  const { data: rsvps } = await supabase
    .from('event_rsvps')
    .select('event_id, player_id, response')
    .in('event_id', eventIds)

  // Total players per team. One query per club is fine since teams are few.
  const { data: events } = await supabase
    .from('events')
    .select('id, team_id')
    .in('id', eventIds)

  const teamIds = Array.from(new Set((events ?? []).map(e => e.team_id)))
  const playerCountByTeam: Record<string, number> = {}
  if (teamIds.length > 0) {
    const { data: players } = await supabase
      .from('players')
      .select('team_id')
      .in('team_id', teamIds)
    for (const p of players ?? []) {
      playerCountByTeam[p.team_id] = (playerCountByTeam[p.team_id] ?? 0) + 1
    }
  }

  const eventTeam: Record<string, string> = {}
  for (const e of events ?? []) eventTeam[e.id] = e.team_id

  const tallies: Record<string, RsvpTally> = {}
  for (const id of eventIds) {
    tallies[id] = {
      going: 0,
      notGoing: 0,
      totalKids: playerCountByTeam[eventTeam[id]] ?? 0,
    }
  }
  for (const r of rsvps ?? []) {
    const t = tallies[r.event_id]
    if (!t) continue
    if (r.response === 'going') t.going++
    else if (r.response === 'not_going') t.notGoing++
  }

  return tallies
}
