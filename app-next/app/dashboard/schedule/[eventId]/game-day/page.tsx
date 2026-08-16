import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getEffectiveRole } from '@/lib/admin-role'
import GameDayClient from './game-day-client'

export const metadata: Metadata = { title: 'Game Day' }
export const dynamic = 'force-dynamic'

export default async function GameDayPage({ params }: { params: Promise<{ eventId: string }> }) {
  const { eventId } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, club_id, role')
    .eq('user_id', user.id)
    .single()

  if (!profile?.club_id) redirect('/dashboard')

  const role = await getEffectiveRole(profile.role)
  if (role !== 'doc' && role !== 'coach') redirect('/dashboard')

  const { data: event } = await supabase
    .from('events')
    .select(`
      id, type, title, start_time, end_time, status, address, team_id,
      teams ( name, age_group ),
      venues ( name, address )
    `)
    .eq('id', eventId)
    .eq('club_id', profile.club_id)
    .single()

  if (!event) notFound()

  const { data: players } = await supabase
    .from('players')
    .select('id, first_name, last_name, jersey_number, position')
    .eq('team_id', event.team_id)
    .order('jersey_number', { nullsFirst: false })
    .order('last_name')

  const { data: attendance } = await supabase
    .from('attendance')
    .select('player_id, status')
    .eq('event_id', eventId)

  const attendanceMap: Record<string, string> = {}
  for (const a of attendance ?? []) attendanceMap[a.player_id] = a.status

  // Pre-load existing feedback so the coach can spot which kids already
  // have a rating and which are still missing one. We only need today's
  // entries against this event so the UI can paint a "Done" check.
  const { data: feedback } = await supabase
    .from('player_feedback')
    .select('id, player_id, rating, notes, category')
    .eq('event_id', eventId)
    .eq('coach_id', profile.id)

  const feedbackMap: Record<string, { id: string; rating: number | null; notes: string }> = {}
  for (const f of feedback ?? []) {
    feedbackMap[f.player_id] = { id: f.id, rating: f.rating, notes: f.notes }
  }

  const team = Array.isArray(event.teams) ? event.teams[0] : event.teams
  const venue = Array.isArray(event.venues) ? event.venues[0] : event.venues

  return (
    <div className="min-h-screen bg-dark">
      <GameDayClient
        eventId={event.id}
        eventTitle={event.title}
        eventType={event.type}
        startTime={event.start_time}
        endTime={event.end_time}
        teamId={event.team_id}
        teamName={team?.name ?? ''}
        ageGroup={team?.age_group ?? ''}
        venueName={venue?.name ?? null}
        venueAddress={event.address || venue?.address || null}
        players={players ?? []}
        initialAttendance={attendanceMap}
        initialFeedback={feedbackMap}
      />
    </div>
  )
}
