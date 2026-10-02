import { createClient } from '@/lib/supabase/server'
import { getClubTimezone } from '@/lib/club-timezone-server'
import { isStaff, EVENT_TYPE_LABELS, type EventType } from '@/lib/constants'
import { formatTime, isoToWallDate } from '@/lib/format-datetime'
import { toCsv, csvResponse, fileSlug } from '@/lib/csv'

// Full season schedule download for staff, past and upcoming, in the team's
// timezone. Games with a saved game report carry the final score.

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null)
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, club_id')
    .eq('user_id', user.id)
    .single()
  if (!profile?.club_id || !isStaff(profile.role)) return new Response('Forbidden', { status: 403 })

  const [{ data: club }, { data: events }, { data: reports }, timeZone] = await Promise.all([
    supabase.from('clubs').select('name').eq('id', profile.club_id).single(),
    supabase
      .from('events')
      .select('id, type, title, start_time, end_time, status, address, travel_mode, travel_depart_at, travel_depart_location, travel_return_at, teams ( name ), venues ( name, address )')
      .eq('club_id', profile.club_id)
      .order('start_time'),
    supabase
      .from('game_reports')
      .select('event_id, team_score, opponent_score')
      .eq('club_id', profile.club_id),
    getClubTimezone(),
  ])

  const scoreByEvent = new Map((reports ?? []).map(r => [r.event_id, r]))

  const header = [
    'Date', 'Day', 'Start', 'End', 'Type', 'Event', 'Team', 'Status', 'Venue', 'Address',
    'Travel', 'Departs', 'Departs from', 'Returns', 'Result',
  ]
  const rows = (events ?? []).map(e => {
    const venue = one(e.venues as { name: string; address: string | null } | { name: string; address: string | null }[] | null)
    const team = one(e.teams as { name: string } | { name: string }[] | null)
    const score = scoreByEvent.get(e.id)
    let result = ''
    if (score && score.team_score !== null && score.opponent_score !== null) {
      const outcome = score.team_score > score.opponent_score ? 'W' : score.team_score < score.opponent_score ? 'L' : 'D'
      result = `${outcome} ${score.team_score}-${score.opponent_score}`
    }
    return [
      isoToWallDate(e.start_time, timeZone),
      new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone }).format(new Date(e.start_time)),
      formatTime(e.start_time, timeZone),
      e.end_time ? formatTime(e.end_time, timeZone) : '',
      EVENT_TYPE_LABELS[e.type as EventType] ?? e.type,
      e.title,
      team?.name,
      e.status === 'cancelled' ? 'Cancelled' : 'Scheduled',
      venue?.name,
      e.address || venue?.address,
      e.travel_mode ? e.travel_mode.charAt(0).toUpperCase() + e.travel_mode.slice(1) : '',
      e.travel_depart_at ? formatTime(e.travel_depart_at, timeZone) : '',
      e.travel_depart_location,
      e.travel_return_at ? formatTime(e.travel_return_at, timeZone) : '',
      result,
    ]
  })

  return csvResponse(toCsv(header, rows), `${fileSlug(club?.name ?? 'team')}-schedule.csv`)
}
