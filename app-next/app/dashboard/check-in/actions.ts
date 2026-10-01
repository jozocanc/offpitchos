'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { type ActionResult, toActionError } from '@/lib/action-result'
import { assertNotPreview, getViewerIdentity } from '@/lib/admin-role'
import { getClubTimezoneById } from '@/lib/club-timezone-server'
import { getCurrentProfile } from '@/lib/current-profile'
import { dayKey } from '@/lib/format-datetime'
import {
  CHECKIN_NOTE_MAX,
  isCheckinStatus,
  isScaleValue,
  type CheckinRow,
  type CheckinValues,
} from '@/lib/checkin'

export interface MyCheckinState {
  /** The viewer's own roster row, or null (staff, or not on a roster yet). */
  player: { id: string; firstName: string; teamId: string; clubId: string } | null
  /** Today in the TEAM's timezone, "YYYY-MM-DD". */
  today: string
  checkin: CheckinRow | null
  isPreview: boolean
}

type DbCheckin = {
  id: string
  player_id: string
  checkin_date: string
  sleep: number
  soreness: number
  energy: number
  status: string
  note: string | null
  updated_at: string
}

function toRow(r: DbCheckin): CheckinRow {
  return {
    id: r.id,
    playerId: r.player_id,
    checkinDate: r.checkin_date,
    sleep: r.sleep,
    soreness: r.soreness,
    energy: r.energy,
    status: isCheckinStatus(r.status) ? r.status : 'fit',
    note: r.note,
    updatedAt: r.updated_at,
  }
}

/**
 * Today's check-in for the viewer's own roster row. Preview-aware: in
 * "View as Player" it reads the sample player's row (the head coach can read
 * it under the staff policies), so the form renders as the demo moment.
 */
export async function getMyCheckinState(): Promise<MyCheckinState> {
  const supabase = await createClient()
  const viewer = await getViewerIdentity()
  if (!viewer.realUserId) redirect('/login')

  const { data: rows } = await supabase
    .from('players')
    .select('id, first_name, team_id, club_id, created_at')
    .eq('parent_id', viewer.userId)
    .order('created_at', { ascending: true })
    .limit(1)

  const p = rows?.[0]
  if (!p) {
    return { player: null, today: '', checkin: null, isPreview: viewer.isPreview }
  }

  // The viewer's own club (always, including preview) is already in the
  // request-memoized profile with its timezone, so skip the extra lookup.
  const me = await getCurrentProfile()
  const timeZone = me && me.club_id === p.club_id && me.timezone
    ? me.timezone
    : await getClubTimezoneById(p.club_id)
  const today = dayKey(new Date(), timeZone)

  const { data: existing } = await supabase
    .from('player_checkins')
    .select('id, player_id, checkin_date, sleep, soreness, energy, status, note, updated_at')
    .eq('player_id', p.id)
    .eq('checkin_date', today)
    .maybeSingle()

  return {
    player: { id: p.id, firstName: p.first_name, teamId: p.team_id, clubId: p.club_id },
    today,
    checkin: existing ? toRow(existing as DbCheckin) : null,
    isPreview: viewer.isPreview,
  }
}

export async function submitCheckin(input: CheckinValues): Promise<ActionResult<CheckinRow>> {
  try {
    // Preview renders the form but never writes as the sample player.
    await assertNotPreview()

    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) redirect('/login')

    if (!isScaleValue(input?.sleep) || !isScaleValue(input?.soreness) || !isScaleValue(input?.energy)) {
      throw new Error('Pick a number from 1 to 5 for sleep, soreness and energy.')
    }
    if (!isCheckinStatus(input.status)) {
      throw new Error('Pick Fit, Limited or Out.')
    }
    const note = typeof input.note === 'string' ? input.note.trim() : ''
    if (note.length > CHECKIN_NOTE_MAX) {
      throw new Error(`Keep the note under ${CHECKIN_NOTE_MAX} characters.`)
    }

    // The caller's own roster row. RLS (players_parent_own) enforces this
    // too; checking first gives a clean message instead of a policy error.
    const { data: rows } = await supabase
      .from('players')
      .select('id, team_id, club_id, created_at')
      .eq('parent_id', user.id)
      .order('created_at', { ascending: true })
      .limit(1)

    const player = rows?.[0]
    if (!player) throw new Error('Your account is not linked to a roster spot yet.')

    const timeZone = await getClubTimezoneById(player.club_id)
    const checkinDate = dayKey(new Date(), timeZone)

    const { data, error } = await supabase
      .from('player_checkins')
      .upsert(
        {
          club_id: player.club_id,
          team_id: player.team_id,
          player_id: player.id,
          checkin_date: checkinDate,
          sleep: input.sleep,
          soreness: input.soreness,
          energy: input.energy,
          status: input.status,
          note: note || null,
          created_by: user.id,
        },
        { onConflict: 'player_id,checkin_date' },
      )
      .select('id, player_id, checkin_date, sleep, soreness, energy, status, note, updated_at')
      .single()

    if (error || !data) throw new Error(`Could not save your check-in: ${error?.message ?? 'unknown error'}`)

    revalidatePath('/dashboard')
    revalidatePath('/dashboard/check-in')
    revalidatePath('/dashboard/readiness')
    return { ok: true, data: toRow(data as DbCheckin) }
  } catch (e) {
    return toActionError(e)
  }
}
