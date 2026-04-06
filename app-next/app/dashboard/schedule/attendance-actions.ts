'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

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

  const { error } = await supabase
    .from('attendance')
    .upsert(records, { onConflict: 'event_id,player_id' })

  if (error) throw new Error(`Failed to mark attendance: ${error.message}`)

  revalidatePath('/dashboard/schedule')
}
