'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { sendPushToProfiles } from '@/lib/push'

// Parent-driven RSVP. Lives in its own table (event_rsvps) so the
// attendance table remains the coach's source of truth — a parent
// saying "we'll be there" never overwrites a coach's mark.

export type RsvpResponse = 'going' | 'not_going'

export interface RsvpTally {
  going: number
  notGoing: number
  totalKids: number
}

export async function getMyKidsOnTeamForRsvp(teamId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: players } = await supabase
    .from('players')
    .select('id, first_name, last_name, jersey_number')
    .eq('team_id', teamId)
    .eq('parent_id', user.id)
    .order('last_name')

  return players ?? []
}

// Returns the current parent's RSVPs for the given (event, kids) pairs
// so the modal can preselect the existing answer instead of erasing it.
export async function getMyExistingRsvps(eventId: string, playerIds: string[]) {
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

export async function parentRsvp(input: {
  eventId: string
  teamId: string
  playerIds: string[]
  response: RsvpResponse
}): Promise<{ saved: number; notifiedCoaches: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  if (input.playerIds.length === 0) throw new Error('Select at least one child')

  // RLS will already block someone else's kid, but verify owner-up-front
  // so we can give a clean error message instead of a silent zero-row write.
  const { data: ownedPlayers } = await supabase
    .from('players')
    .select('id, first_name, last_name')
    .eq('parent_id', user.id)
    .eq('team_id', input.teamId)
    .in('id', input.playerIds)

  if (!ownedPlayers || ownedPlayers.length === 0) {
    throw new Error('None of those players belong to you on this team')
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
  // session plan. We don't email — that would spam coaches with one
  // mail per parent confirmation.
  let notifiedCoaches = 0
  if (input.response === 'going') {
    const service = createServiceClient()
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
      const kidNames = ownedPlayers.map(p => p.first_name).join(' & ')
      await sendPushToProfiles(coachIds, {
        title: 'OffPitchOS',
        message: `${kidNames} confirmed for ${event?.title ?? 'an event'}`,
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
export async function getRsvpTalliesForEvents(eventIds: string[]): Promise<Record<string, RsvpTally>> {
  if (eventIds.length === 0) return {}
  const supabase = await createClient()

  const { data: rsvps } = await supabase
    .from('event_rsvps')
    .select('event_id, player_id, response')
    .in('event_id', eventIds)

  // Total kids per team — one query per club is fine since teams are few.
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
