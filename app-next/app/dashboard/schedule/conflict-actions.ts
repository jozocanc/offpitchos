'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

async function getUserProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, club_id, role')
    .eq('user_id', user.id)
    .single()

  if (!profile?.club_id) throw new Error('No club found')
  return { profile, supabase }
}

export interface Conflict {
  type: 'venue' | 'team' | 'coach'
  message: string
  eventTitle: string
  eventTime: string
}

export interface Suggestion {
  startTime: string
  endTime: string
  label: string
}

export async function checkConflicts(input: {
  teamId: string
  startTime: string
  endTime: string
  venueId: string | null
  excludeEventId?: string
}): Promise<Conflict[]> {
  const { profile, supabase } = await getUserProfile()
  const conflicts: Conflict[] = []

  const { teamId, startTime, endTime, venueId, excludeEventId } = input

  // 1. Check team schedule overlap
  let teamQuery = supabase
    .from('events')
    .select('id, title, start_time, end_time')
    .eq('club_id', profile.club_id)
    .eq('team_id', teamId)
    .eq('status', 'scheduled')
    .lt('start_time', endTime)
    .gt('end_time', startTime)

  if (excludeEventId) {
    teamQuery = teamQuery.neq('id', excludeEventId)
  }

  const { data: teamConflicts } = await teamQuery

  for (const e of teamConflicts ?? []) {
    const start = new Date(e.start_time)
    conflicts.push({
      type: 'team',
      message: 'This team already has an event at this time',
      eventTitle: e.title,
      eventTime: start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    })
  }

  // 2. Check venue double-booking
  if (venueId) {
    let venueQuery = supabase
      .from('events')
      .select('id, title, start_time, end_time, teams(name)')
      .eq('club_id', profile.club_id)
      .eq('venue_id', venueId)
      .eq('status', 'scheduled')
      .lt('start_time', endTime)
      .gt('end_time', startTime)

    if (excludeEventId) {
      venueQuery = venueQuery.neq('id', excludeEventId)
    }

    const { data: venueConflicts } = await venueQuery

    for (const e of venueConflicts ?? []) {
      // Skip if same team (already caught above)
      if (teamConflicts?.some(tc => tc.id === e.id)) continue
      const start = new Date(e.start_time)
      const teamName = (e.teams as any)?.name ?? 'Another team'
      conflicts.push({
        type: 'venue',
        message: `This venue is booked by ${teamName}`,
        eventTitle: e.title,
        eventTime: start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      })
    }
  }

  // 3. Check coach conflicts (coaches assigned to multiple teams)
  const { data: coaches } = await supabase
    .from('team_members')
    .select('profile_id')
    .eq('team_id', teamId)
    .eq('role', 'coach')

  if (coaches && coaches.length > 0) {
    const coachIds = coaches.map(c => c.profile_id)

    // Find other teams these coaches are on
    const { data: otherTeams } = await supabase
      .from('team_members')
      .select('team_id, profile_id, profiles(display_name)')
      .in('profile_id', coachIds)
      .eq('role', 'coach')
      .neq('team_id', teamId)

    if (otherTeams && otherTeams.length > 0) {
      const otherTeamIds = [...new Set(otherTeams.map(t => t.team_id))]

      let coachQuery = supabase
        .from('events')
        .select('id, title, start_time, end_time, team_id, teams(name)')
        .eq('club_id', profile.club_id)
        .in('team_id', otherTeamIds)
        .eq('status', 'scheduled')
        .lt('start_time', endTime)
        .gt('end_time', startTime)

      if (excludeEventId) {
        coachQuery = coachQuery.neq('id', excludeEventId)
      }

      const { data: coachConflicts } = await coachQuery

      for (const e of coachConflicts ?? []) {
        const overlappingCoaches = otherTeams
          .filter(t => t.team_id === e.team_id)
          .map(t => (t.profiles as any)?.display_name ?? 'A coach')

        const start = new Date(e.start_time)
        const teamName = (e.teams as any)?.name ?? 'another team'
        conflicts.push({
          type: 'coach',
          message: `${overlappingCoaches.join(', ')} also coaches ${teamName} at this time`,
          eventTitle: e.title,
          eventTime: start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
        })
      }
    }
  }

  return conflicts
}

export async function suggestAlternatives(input: {
  teamId: string
  venueId: string | null
  date: string
  durationMinutes: number
}): Promise<Suggestion[]> {
  const { profile, supabase } = await getUserProfile()

  const { teamId, venueId, date, durationMinutes } = input
  const suggestions: Suggestion[] = []

  // Get all events on this date for this team and venue
  const dayStart = new Date(`${date}T00:00:00`)
  const dayEnd = new Date(`${date}T23:59:59`)

  const { data: dayEvents } = await supabase
    .from('events')
    .select('start_time, end_time, team_id, venue_id')
    .eq('club_id', profile.club_id)
    .eq('status', 'scheduled')
    .gte('start_time', dayStart.toISOString())
    .lte('start_time', dayEnd.toISOString())
    .order('start_time', { ascending: true })

  const events = dayEvents ?? []

  // Try slots from 7 AM to 9 PM in 30-min increments
  for (let hour = 7; hour <= 21; hour++) {
    for (const min of [0, 30]) {
      const slotStart = new Date(`${date}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`)
      const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60 * 1000)

      // Don't suggest slots past 10 PM
      if (slotEnd.getHours() >= 22) continue

      // Check if slot conflicts with team schedule
      const teamConflict = events.some(e =>
        e.team_id === teamId &&
        new Date(e.start_time) < slotEnd &&
        new Date(e.end_time) > slotStart
      )
      if (teamConflict) continue

      // Check if slot conflicts with venue
      if (venueId) {
        const venueConflict = events.some(e =>
          e.venue_id === venueId &&
          new Date(e.start_time) < slotEnd &&
          new Date(e.end_time) > slotStart
        )
        if (venueConflict) continue
      }

      const label = slotStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) +
        ' – ' + slotEnd.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

      suggestions.push({
        startTime: slotStart.toISOString(),
        endTime: slotEnd.toISOString(),
        label,
      })

      if (suggestions.length >= 5) return suggestions
    }
  }

  return suggestions
}
