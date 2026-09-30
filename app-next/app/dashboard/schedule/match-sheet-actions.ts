'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { assertNotPreview } from '@/lib/admin-role'
import { isStaff } from '@/lib/constants'
import { type ActionResult, toActionError } from '@/lib/action-result'
import { TRAVEL_SELECT } from '@/lib/travel'
import {
  isHomeGame,
  MATCH_SHEET_FIELDS,
  MATCH_SHEET_LIMITS,
  type MatchSheet,
  type MatchSheetFields,
} from '@/lib/match-sheet'

const SHEET_SELECT = `token, enabled, ${MATCH_SHEET_FIELDS.join(', ')}`

/**
 * Staff caller + an event in their club. Throws with a user-facing message
 * otherwise. RLS on match_sheets enforces the same thing; this check exists so
 * the coach gets a clear error instead of an empty result.
 */
async function requireStaffEvent(eventId: string) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, club_id, role')
    .eq('user_id', user.id)
    .single()

  if (!profile?.club_id) throw new Error('No team found')
  if (!isStaff(profile.role)) throw new Error('Only staff can manage visitor info.')

  const { data: event } = await supabase
    .from('events')
    .select(`id, club_id, type, venue_id, ${TRAVEL_SELECT}`)
    .eq('id', eventId)
    .eq('club_id', profile.club_id)
    .maybeSingle()

  if (!event) throw new Error('Event not found.')

  return { supabase, clubId: profile.club_id as string, event: event as unknown as Parameters<typeof isHomeGame>[0] & { id: string } }
}

function toSheet(row: Record<string, unknown>): MatchSheet {
  const sheet = { token: String(row.token), enabled: Boolean(row.enabled) } as MatchSheet
  for (const f of MATCH_SHEET_FIELDS) sheet[f] = (row[f] as string | null) ?? ''
  return sheet
}

// ---------- Read ----------

export async function getMatchSheet(eventId: string): Promise<ActionResult<MatchSheet | null>> {
  try {
    const { supabase } = await requireStaffEvent(eventId)
    const { data, error } = await supabase
      .from('match_sheets')
      .select(SHEET_SELECT)
      .eq('event_id', eventId)
      .maybeSingle()
    if (error) throw new Error('Could not load visitor info.')
    return { ok: true, data: data ? toSheet(data as unknown as Record<string, unknown>) : null }
  } catch (e) {
    return toActionError(e)
  }
}

// ---------- Write ----------

export async function saveMatchSheet(
  eventId: string,
  fields: MatchSheetFields,
): Promise<ActionResult<MatchSheet>> {
  try {
    await assertNotPreview()
    const { supabase, clubId, event } = await requireStaffEvent(eventId)
    if (!isHomeGame(event)) throw new Error('Visitor info is only available for home games.')

    const row: Record<string, string | null> = {}
    for (const f of MATCH_SHEET_FIELDS) {
      const value = String(fields?.[f] ?? '').trim()
      if (value.length > MATCH_SHEET_LIMITS[f]) {
        throw new Error(`${f.replace('_', ' ')} is too long (max ${MATCH_SHEET_LIMITS[f]} characters).`)
      }
      row[f] = value || null
    }

    const { data, error } = await supabase
      .from('match_sheets')
      .upsert({ event_id: eventId, club_id: clubId, ...row }, { onConflict: 'event_id' })
      .select(SHEET_SELECT)
      .single()

    if (error || !data) throw new Error('Could not save visitor info.')

    revalidatePath('/dashboard/schedule')
    return { ok: true, data: toSheet(data as unknown as Record<string, unknown>) }
  } catch (e) {
    return toActionError(e)
  }
}

export async function setMatchSheetEnabled(
  eventId: string,
  enabled: boolean,
): Promise<ActionResult<MatchSheet>> {
  try {
    await assertNotPreview()
    const { supabase } = await requireStaffEvent(eventId)

    const { data, error } = await supabase
      .from('match_sheets')
      .update({ enabled: Boolean(enabled) })
      .eq('event_id', eventId)
      .select(SHEET_SELECT)
      .maybeSingle()

    if (error) throw new Error('Could not update the link.')
    if (!data) throw new Error('Save the visitor info first.')

    revalidatePath('/dashboard/schedule')
    return { ok: true, data: toSheet(data as unknown as Record<string, unknown>) }
  } catch (e) {
    return toActionError(e)
  }
}
