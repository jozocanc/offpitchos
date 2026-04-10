'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { sendPushToProfiles } from '@/lib/push'

export async function getAttendanceData(eventId: string, teamId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Get players on this team
  const { data: players } = await supabase
    .from('players')
    .select('id, first_name, last_name, jersey_number')
    .eq('team_id', teamId)
    .order('last_name')

  // Get existing attendance records for this event
  const { data: records } = await supabase
    .from('attendance')
    .select('player_id, status')
    .eq('event_id', eventId)

  const attendanceMap: Record<string, string> = {}
  records?.forEach(r => { attendanceMap[r.player_id] = r.status })

  return {
    players: players ?? [],
    attendance: attendanceMap,
  }
}

export async function markAttendance(
  eventId: string,
  playerId: string,
  status: 'present' | 'absent' | 'late' | 'excused'
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { error } = await supabase
    .from('attendance')
    .upsert(
      {
        event_id: eventId,
        player_id: playerId,
        status,
        marked_by: user.id,
      },
      { onConflict: 'event_id,player_id' }
    )

  if (error) throw new Error(`Failed to mark attendance: ${error.message}`)

  revalidatePath('/dashboard/schedule')
}

export async function markBulkAttendance(
  eventId: string,
  playerIds: string[],
  status: 'present' | 'absent'
) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const records = playerIds.map(playerId => ({
    event_id: eventId,
    player_id: playerId,
    status,
    marked_by: user.id,
  }))

  const { error: bulkErr } = await supabase
    .from('attendance')
    .upsert(records, { onConflict: 'event_id,player_id' })

  if (bulkErr) throw new Error(`Failed to mark attendance: ${bulkErr.message}`)

  revalidatePath('/dashboard/schedule')
}

// ---- Parent-facing "my kid can't attend" flow ----

export async function getMyKidsOnTeam(teamId: string) {
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

// Marks selected kids as "excused" and notifies the team's coaches with
// an optional reason. Does NOT create a coverage request (that's the
// coach flow) — just a heads-up so the coach knows before practice.
export async function parentExcuseChildren(input: {
  eventId: string
  teamId: string
  playerIds: string[]
  reason: string
}): Promise<{ excused: number; notifiedCoaches: number }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  if (input.playerIds.length === 0) throw new Error('Select at least one child')

  const { data: ownedPlayers } = await supabase
    .from('players')
    .select('id, first_name, last_name')
    .eq('parent_id', user.id)
    .eq('team_id', input.teamId)
    .in('id', input.playerIds)

  if (!ownedPlayers || ownedPlayers.length === 0) {
    throw new Error('None of those players belong to you on this team')
  }

  const excuseRecords = ownedPlayers.map(p => ({
    event_id: input.eventId,
    player_id: p.id,
    status: 'excused' as const,
    marked_by: user.id,
  }))

  const { error: excuseErr } = await supabase
    .from('attendance')
    .upsert(excuseRecords, { onConflict: 'event_id,player_id' })

  if (excuseErr) throw new Error(`Failed to excuse: ${excuseErr.message}`)

  // Notify the team's coaches
  const service = createServiceClient()
  const { data: event } = await service
    .from('events')
    .select('title')
    .eq('id', input.eventId)
    .single()

  const kidNames = ownedPlayers.map(p => p.first_name).join(' & ')
  const reasonSuffix = input.reason.trim() ? ` — "${input.reason.trim()}"` : ''
  const message = `${kidNames} can't attend ${event?.title ?? 'an event'}${reasonSuffix}`

  const { data: coaches } = await service
    .from('team_members')
    .select('profile_id')
    .eq('team_id', input.teamId)
    .eq('role', 'coach')

  let notifiedCoaches = 0
  const coachIds = (coaches ?? []).map(c => c.profile_id)
  if (coachIds.length > 0) {
    await sendPushToProfiles(coachIds, {
      title: 'OffPitchOS',
      message,
      url: '/dashboard/schedule',
      tag: 'parent_excuse',
    })
    notifiedCoaches = coachIds.length
  }

  revalidatePath('/dashboard/schedule')
  return { excused: ownedPlayers.length, notifiedCoaches }
}
