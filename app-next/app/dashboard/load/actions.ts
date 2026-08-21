'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { getEffectiveRole } from '@/lib/admin-role'
import { type ActionResult, toActionError } from '@/lib/action-result'
import { type GpsField, type MappedField } from '@/lib/gps/columns'

async function getStaffProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, club_id, role')
    .eq('user_id', user.id)
    .single()

  if (!profile?.club_id) throw new Error('No club found')

  const role = await getEffectiveRole(profile.role)
  if (role !== 'doc' && role !== 'coach') {
    throw new Error('Only coaching staff can import session load')
  }

  return { profile, supabase }
}

export interface LoadSession {
  eventId: string
  title: string
  startTime: string
  type: string
  teamName: string
  playersImported: number
}

export interface LoadPageData {
  sessions: LoadSession[]
  roster: { id: string; firstName: string; lastName: string; jerseyNumber: number | null }[]
  savedMapping: Record<string, MappedField | ''> | null
}

export async function getLoadPageData(): Promise<LoadPageData> {
  const { profile, supabase } = await getStaffProfile()

  // Past and in-progress sessions only. You cannot import load for a session
  // that has not happened, and offering them makes the list unusable.
  const { data: events } = await supabase
    .from('events')
    .select('id, title, start_time, type, teams(name)')
    .eq('club_id', profile.club_id)
    .lte('start_time', new Date().toISOString())
    .neq('status', 'cancelled')
    .order('start_time', { ascending: false })
    .limit(40)

  const eventIds = (events ?? []).map(e => e.id)

  const { data: existing } = eventIds.length
    ? await supabase
        .from('event_player_load')
        .select('event_id')
        .in('event_id', eventIds)
    : { data: [] }

  const countByEvent = new Map<string, number>()
  for (const row of existing ?? []) {
    countByEvent.set(row.event_id, (countByEvent.get(row.event_id) ?? 0) + 1)
  }

  const { data: players } = await supabase
    .from('players')
    .select('id, first_name, last_name, jersey_number')
    .eq('club_id', profile.club_id)
    .order('jersey_number', { ascending: true })

  const { data: settings } = await supabase
    .from('club_settings')
    .select('gps_column_map')
    .eq('club_id', profile.club_id)
    .maybeSingle()

  return {
    sessions: (events ?? []).map(e => {
      const team = Array.isArray(e.teams) ? e.teams[0] : e.teams
      return {
        eventId: e.id,
        title: e.title,
        startTime: e.start_time,
        type: e.type,
        teamName: (team as { name?: string } | null)?.name ?? '',
        playersImported: countByEvent.get(e.id) ?? 0,
      }
    }),
    roster: (players ?? []).map(p => ({
      id: p.id,
      firstName: p.first_name,
      lastName: p.last_name,
      jerseyNumber: p.jersey_number,
    })),
    savedMapping: (settings?.gps_column_map as Record<string, MappedField | ''> | null) ?? null,
  }
}

export interface ImportRow {
  playerId: string
  metrics: Partial<Record<GpsField, number | null>>
  extra: Record<string, string>
}

export async function importEventLoad(
  eventId: string,
  rows: ImportRow[],
  mapping: Record<string, MappedField | ''>
): Promise<ActionResult<{ imported: number }>> {
  try {
    const { profile, supabase } = await getStaffProfile()

    if (rows.length === 0) throw new Error('Nothing to import — no rows matched a player.')

    // Confirm the event belongs to this club before writing anything against
    // it. RLS would refuse the insert anyway; this produces a sentence a human
    // can act on instead of a policy violation.
    const { data: event } = await supabase
      .from('events')
      .select('id')
      .eq('id', eventId)
      .eq('club_id', profile.club_id)
      .single()

    if (!event) throw new Error('That session is not in your club.')

    const { error } = await supabase
      .from('event_player_load')
      .upsert(
        rows.map(r => ({
          club_id: profile.club_id,
          event_id: eventId,
          player_id: r.playerId,
          ...r.metrics,
          extra: r.extra,
          source: 'csv',
          imported_at: new Date().toISOString(),
        })),
        { onConflict: 'event_id,player_id' }
      )

    if (error) throw new Error(error.message)

    // Remember the mapping so the next upload from the same export skips it.
    await supabase
      .from('club_settings')
      .update({ gps_column_map: mapping })
      .eq('club_id', profile.club_id)

    revalidatePath('/dashboard/load')
    return { ok: true, data: { imported: rows.length } }
  } catch (e) {
    return toActionError(e)
  }
}

export interface SessionLoadRow {
  playerName: string
  jerseyNumber: number | null
  durationMin: number | null
  distanceM: number | null
  highSpeedDistanceM: number | null
  sprints: number | null
  topSpeedKmh: number | null
  playerLoad: number | null
}

export async function getSessionLoad(eventId: string): Promise<SessionLoadRow[]> {
  const { profile, supabase } = await getStaffProfile()

  const { data } = await supabase
    .from('event_player_load')
    .select('duration_min, distance_m, high_speed_distance_m, sprints, top_speed_kmh, player_load, players(first_name, last_name, jersey_number)')
    .eq('event_id', eventId)
    .eq('club_id', profile.club_id)

  return (data ?? []).map(r => {
    const p = Array.isArray(r.players) ? r.players[0] : r.players
    const player = p as { first_name?: string; last_name?: string; jersey_number?: number } | null
    return {
      playerName: `${player?.first_name ?? ''} ${player?.last_name ?? ''}`.trim(),
      jerseyNumber: player?.jersey_number ?? null,
      durationMin: r.duration_min,
      distanceM: r.distance_m,
      highSpeedDistanceM: r.high_speed_distance_m,
      sprints: r.sprints,
      topSpeedKmh: r.top_speed_kmh,
      playerLoad: r.player_load,
    }
  }).sort((a, b) => (b.distanceM ?? 0) - (a.distanceM ?? 0))
}
