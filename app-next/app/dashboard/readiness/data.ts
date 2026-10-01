import { createClient } from '@/lib/supabase/server'
import { getClubTimezone } from '@/lib/club-timezone-server'
import { getCurrentProfile } from '@/lib/current-profile'
import { addDaysToKey, dayKey } from '@/lib/format-datetime'
import { READINESS_LOOKBACK_DAYS, isCheckinStatus, isFlagged, type CheckinStatus } from '@/lib/checkin'

// Server-only loader for /dashboard/readiness. Deliberately NOT a 'use server'
// module: nothing here should be callable from the client.

export type Availability = 'available' | 'limited' | 'out' | 'unknown'

export interface ReadinessCheckin {
  status: CheckinStatus
  sleep: number
  soreness: number
  energy: number
  note: string | null
}

export interface ReadinessPlayer {
  id: string
  firstName: string
  lastName: string
  jerseyNumber: number | null
  position: string | null
  /** Check-in on the selected day, or null. */
  checkin: ReadinessCheckin | null
  flagged: boolean
  /** Status per day for the 7 days ending on the selected day (oldest first). */
  history: (CheckinStatus | null)[]
  /** Next-game availability: latest check-in (last 2 days) + RSVP. */
  availability: Availability
  rsvp: 'going' | 'not_going' | null
}

export interface ReadinessData {
  teams: { id: string; name: string }[]
  teamId: string | null
  timeZone: string
  today: string
  selectedDate: string
  historyDays: string[]
  players: ReadinessPlayer[]
  nextEvent: { id: string; title: string; type: string; startTime: string } | null
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

export async function getReadinessData(opts: { team?: string; date?: string }): Promise<ReadinessData> {
  const supabase = await createClient()
  // Both request-memoized (lib/current-profile): the page already loaded the
  // profile for its role check, so the timezone and club id cost no query.
  const [timeZone, profile] = await Promise.all([getClubTimezone(), getCurrentProfile()])
  const today = dayKey(new Date(), timeZone)
  const earliest = addDaysToKey(today, -READINESS_LOOKBACK_DAYS)
  const selectedDate =
    opts.date && DATE_RE.test(opts.date) && opts.date <= today && opts.date >= earliest ? opts.date : today

  const clubId = profile?.club_id ?? null

  const historyDays = Array.from({ length: 7 }, (_, i) => addDaysToKey(selectedDate, i - 6))
  const empty: ReadinessData = {
    teams: [], teamId: null, timeZone, today, selectedDate, historyDays, players: [], nextEvent: null,
  }
  if (!clubId) return empty

  const { data: teamRows } = await supabase
    .from('teams')
    .select('id, name')
    .eq('club_id', clubId)
    .order('name')
  const teams = (teamRows ?? []).map(t => ({ id: t.id as string, name: t.name as string }))
  const teamId = teams.find(t => t.id === opts.team)?.id ?? teams[0]?.id ?? null
  if (!teamId) return { ...empty, teams }

  const yesterday = addDaysToKey(today, -1)
  const rangeStart = historyDays[0] < yesterday ? historyDays[0] : yesterday
  const nowIso = new Date().toISOString()

  const [rosterRes, checkinRes, { eventRes, rsvps }] = await Promise.all([
    supabase
      .from('players')
      .select('id, first_name, last_name, jersey_number, position')
      .eq('team_id', teamId)
      .order('jersey_number', { ascending: true, nullsFirst: false }),
    supabase
      .from('player_checkins')
      .select('player_id, checkin_date, status, sleep, soreness, energy, note')
      .eq('team_id', teamId)
      .gte('checkin_date', rangeStart)
      .lte('checkin_date', today),
    // Next game or tournament. end_time >= now keeps a weekend tournament
    // that has already kicked off in play until it finishes.
    supabase
      .from('events')
      .select('id, title, type, start_time')
      .eq('team_id', teamId)
      .eq('status', 'scheduled')
      .in('type', ['game', 'tournament'])
      .gte('end_time', nowIso)
      .order('start_time', { ascending: true })
      .limit(1)
      // The next game's RSVPs chain straight off it instead of waiting for
      // the roster and check-ins too.
      .then(async eventRes => {
        const id = eventRes.data?.[0]?.id as string | undefined
        const rsvps = id
          ? (await supabase.from('event_rsvps').select('player_id, response').eq('event_id', id)).data
          : null
        return { eventRes, rsvps }
      }),
  ])

  if (checkinRes.error) console.error('[readiness] check-ins query failed:', checkinRes.error.message)

  const nextEventRow = eventRes.data?.[0] ?? null
  const nextEvent = nextEventRow
    ? {
        id: nextEventRow.id as string,
        title: nextEventRow.title as string,
        type: nextEventRow.type as string,
        startTime: nextEventRow.start_time as string,
      }
    : null

  const rsvpByPlayer = new Map<string, 'going' | 'not_going'>()
  if (nextEvent) {
    for (const r of rsvps ?? []) {
      if (r.response === 'going' || r.response === 'not_going') rsvpByPlayer.set(r.player_id as string, r.response)
    }
  }

  // player -> date -> check-in
  const byPlayer = new Map<string, Map<string, ReadinessCheckin>>()
  for (const c of checkinRes.data ?? []) {
    if (!isCheckinStatus(c.status)) continue
    const m = byPlayer.get(c.player_id as string) ?? new Map<string, ReadinessCheckin>()
    m.set(c.checkin_date as string, {
      status: c.status,
      sleep: c.sleep as number,
      soreness: c.soreness as number,
      energy: c.energy as number,
      note: (c.note as string | null) ?? null,
    })
    byPlayer.set(c.player_id as string, m)
  }

  const players: ReadinessPlayer[] = (rosterRes.data ?? []).map(p => {
    const days = byPlayer.get(p.id as string)
    const checkin = days?.get(selectedDate) ?? null
    const latest = days?.get(today) ?? days?.get(yesterday) ?? null
    const rsvp = rsvpByPlayer.get(p.id as string) ?? null
    return {
      id: p.id as string,
      firstName: p.first_name as string,
      lastName: p.last_name as string,
      jerseyNumber: (p.jersey_number as number | null) ?? null,
      position: (p.position as string | null) ?? null,
      checkin,
      flagged: checkin ? isFlagged(checkin) : false,
      history: historyDays.map(d => days?.get(d)?.status ?? null),
      availability: combineAvailability(latest?.status ?? null, rsvp),
      rsvp,
    }
  })

  return { teams, teamId, timeZone, today, selectedDate, historyDays, players, nextEvent }
}

/**
 * RSVP "can't make it" or a check-in of 'out' wins. Otherwise the most recent
 * check-in decides; with no check-in, an RSVP of 'going' counts as available.
 */
export function combineAvailability(status: CheckinStatus | null, rsvp: 'going' | 'not_going' | null): Availability {
  if (rsvp === 'not_going' || status === 'out') return 'out'
  if (status === 'limited') return 'limited'
  if (status === 'fit') return 'available'
  if (rsvp === 'going') return 'available'
  return 'unknown'
}
