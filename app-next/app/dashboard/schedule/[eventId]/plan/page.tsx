import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveRole } from '@/lib/admin-role'
import { getCurrentProfile } from '@/lib/current-profile'
import { getClubTimezone } from '@/lib/club-timezone-server'
import { isStaff } from '@/lib/constants'
import { addDaysToKey, dayKey } from '@/lib/format-datetime'
import { isCheckinStatus, type CheckinStatus } from '@/lib/checkin'
import { combineAvailability } from '@/app/dashboard/readiness/data'
import { normalizePlanDoc, type PlanPlayer } from '@/lib/game-plan'
import { listDrills } from '@/app/dashboard/tactics/actions'
import PlanClient, { type PlanDrill, type PlanEventInfo } from './plan-client'

export const metadata: Metadata = { title: 'Game plan' }
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function GamePlanPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  if (!UUID_RE.test(eventId)) notFound()

  const profile = await getCurrentProfile()
  if (!profile) redirect('/login')
  if (!profile.club_id) redirect('/dashboard')

  const supabase = await createClient()
  const [role, timeZone] = await Promise.all([
    getEffectiveRole(profile.role ?? 'player'),
    getClubTimezone(),
  ])
  const staff = isStaff(role)

  // RLS decides who can read the event: staff of the club, or members of
  // its team.
  const { data: event } = await supabase
    .from('events')
    .select('id, type, title, start_time, end_time, status, address, team_id, club_id, teams ( name ), venues ( name, address )')
    .eq('id', eventId)
    .eq('club_id', profile.club_id)
    .maybeSingle()

  if (!event) notFound()
  if (event.type !== 'game' && event.type !== 'tournament') notFound()

  const team = Array.isArray(event.teams) ? event.teams[0] : event.teams
  const venue = Array.isArray(event.venues) ? event.venues[0] : event.venues
  const eventInfo: PlanEventInfo = {
    id: event.id as string,
    title: event.title as string,
    type: event.type as string,
    startTime: event.start_time as string,
    endTime: event.end_time as string,
    cancelled: event.status === 'cancelled',
    teamName: (team as { name?: string } | null)?.name ?? '',
    venueName: (venue as { name?: string } | null)?.name ?? null,
    venueAddress: (event.address as string | null) || (venue as { address?: string | null } | null)?.address || null,
  }

  const { data: planRow } = await supabase
    .from('game_plans')
    .select('formation, lineup, set_pieces, drill_ids, notes, shared_with_players, updated_at')
    .eq('event_id', eventId)
    .maybeSingle()

  // Players (and a head coach previewing as one) only ever see a shared plan.
  const shared = Boolean(planRow?.shared_with_players)
  if (!staff && !shared) {
    return (
      <PlanClient
        mode="unshared"
        event={eventInfo}
        timeZone={timeZone}
        initialDoc={normalizePlanDoc(null)}
        initialShared={false}
        players={[]}
        drills={[]}
      />
    )
  }

  // Name / number / position only, for staff and teammates alike (053).
  const { data: rosterRows } = await supabase.rpc('get_team_roster', { p_team_id: event.team_id })

  let availability = new Map<string, ReturnType<typeof combineAvailability>>()
  let drills: PlanDrill[] = []
  if (staff) {
    const today = dayKey(new Date(), timeZone)
    const yesterday = addDaysToKey(today, -1)
    const [checkinRes, rsvpRes, drillList] = await Promise.all([
      supabase
        .from('player_checkins')
        .select('player_id, checkin_date, status')
        .eq('team_id', event.team_id)
        .gte('checkin_date', yesterday)
        .lte('checkin_date', today),
      supabase
        .from('event_rsvps')
        .select('player_id, response')
        .eq('event_id', eventId),
      listDrills(),
    ])

    const latest = new Map<string, { date: string; status: CheckinStatus }>()
    for (const c of checkinRes.data ?? []) {
      if (!isCheckinStatus(c.status)) continue
      const prev = latest.get(c.player_id as string)
      if (!prev || (c.checkin_date as string) > prev.date) {
        latest.set(c.player_id as string, { date: c.checkin_date as string, status: c.status })
      }
    }
    const rsvp = new Map<string, 'going' | 'not_going'>()
    for (const r of rsvpRes.data ?? []) {
      if (r.response === 'going' || r.response === 'not_going') rsvp.set(r.player_id as string, r.response)
    }
    availability = new Map(
      (rosterRows ?? []).map((p: { id: string }) => [
        p.id,
        combineAvailability(latest.get(p.id)?.status ?? null, rsvp.get(p.id) ?? null),
      ]),
    )

    // Drills of this team or not tied to a team.
    drills = drillList
      .filter(d => !d.teamId || d.teamId === event.team_id)
      .map(d => ({ id: d.id, title: d.title, category: d.category, thumbnailUrl: d.thumbnailUrl }))
  }

  type RosterRow = { id: string; first_name: string | null; last_name: string | null; jersey_number: number | null; position: string | null }
  const players: PlanPlayer[] = ((rosterRows ?? []) as RosterRow[])
    .map(p => ({
      id: p.id,
      firstName: p.first_name ?? '',
      lastName: p.last_name ?? '',
      jerseyNumber: p.jersey_number ?? null,
      position: p.position ?? null,
      availability: availability.get(p.id) ?? 'unknown',
    }))
    .sort((a, b) => (a.jerseyNumber ?? 999) - (b.jerseyNumber ?? 999) || a.lastName.localeCompare(b.lastName))

  return (
    <PlanClient
      mode={staff ? 'edit' : 'view'}
      event={eventInfo}
      timeZone={timeZone}
      initialDoc={normalizePlanDoc(planRow)}
      initialShared={shared}
      players={players}
      drills={drills}
    />
  )
}
