'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { assertNotPreview } from '@/lib/admin-role'
import { isStaff, isMember } from '@/lib/constants'
import { type ActionResult, toActionError } from '@/lib/action-result'
import { sendPushToProfiles } from '@/lib/push'
import { GamePlanDocSchema, type GamePlanDoc } from '@/lib/game-plan'

// Game plan (059). Staff write; players read shared plans under RLS.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function requireStaffGame(eventId: string) {
  if (!UUID_RE.test(eventId)) throw new Error('Event not found.')
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, club_id, role')
    .eq('user_id', user.id)
    .single()

  if (!profile?.club_id) throw new Error('No team found')
  if (!isStaff(profile.role)) throw new Error('Only staff can edit the game plan.')

  const { data: event } = await supabase
    .from('events')
    .select('id, club_id, team_id, type, title')
    .eq('id', eventId)
    .eq('club_id', profile.club_id)
    .maybeSingle()

  if (!event) throw new Error('Event not found.')
  if (event.type !== 'game' && event.type !== 'tournament') {
    throw new Error('Game plans are for games and tournaments only.')
  }

  return {
    supabase,
    userId: user.id,
    clubId: profile.club_id as string,
    event: {
      id: event.id as string,
      teamId: event.team_id as string,
      title: event.title as string,
    },
  }
}

/** Only ids that are on this team's roster (no planting other teams' players). */
async function rosterIds(supabase: Awaited<ReturnType<typeof createClient>>, teamId: string): Promise<Set<string>> {
  const { data } = await supabase.from('players').select('id').eq('team_id', teamId)
  return new Set((data ?? []).map(p => p.id as string))
}

function scrubDoc(doc: GamePlanDoc, roster: Set<string>, drillIds: Set<string>): GamePlanDoc {
  const keep = (id: string | null | undefined) => (id && roster.has(id) ? id : null)
  const seen = new Set<string>()
  const slots = doc.lineup.slots.map(s => {
    const id = keep(s.player_id)
    if (id && seen.has(id)) return { ...s, player_id: null }
    if (id) seen.add(id)
    return { ...s, player_id: id }
  })
  const bench = Array.from(new Set(doc.lineup.bench)).filter(id => roster.has(id) && !seen.has(id))
  const set_pieces = { ...doc.set_pieces }
  for (const k of ['corner_attack_left', 'corner_attack_right', 'corner_defend'] as const) {
    const sp = set_pieces[k]
    if (!sp) continue
    set_pieces[k] = { ...sp, markers: sp.markers.map(m => ({ ...m, player_id: keep(m.player_id) })) }
  }
  return {
    ...doc,
    lineup: { slots, bench, captain_id: keep(doc.lineup.captain_id) },
    set_pieces,
    drill_ids: Array.from(new Set(doc.drill_ids)).filter(id => drillIds.has(id)),
  }
}

// ─── Save (autosave) ─────────────────────────────────────────────────────────

export async function saveGamePlan(
  ...args: Parameters<typeof _saveGamePlan>
): Promise<ActionResult<Awaited<ReturnType<typeof _saveGamePlan>>>> {
  try {
    return { ok: true, data: await _saveGamePlan(...args) }
  } catch (e) {
    return toActionError(e)
  }
}

async function _saveGamePlan(eventId: string, input: unknown): Promise<{ updatedAt: string }> {
  await assertNotPreview()
  const parsed = GamePlanDocSchema.safeParse(input)
  if (!parsed.success) throw new Error('The game plan could not be saved: invalid data.')
  if (parsed.data.lineup.slots.length !== 11) throw new Error('A lineup needs exactly 11 slots.')

  const ctx = await requireStaffGame(eventId)
  const { supabase } = ctx

  const wantDrills = parsed.data.drill_ids
  const [roster, drillRows] = await Promise.all([
    rosterIds(supabase, ctx.event.teamId),
    wantDrills.length
      ? supabase.from('drills').select('id').eq('club_id', ctx.clubId).in('id', wantDrills).then(r => r.data)
      : Promise.resolve([] as { id: string }[]),
  ])
  const doc = scrubDoc(parsed.data, roster, new Set((drillRows ?? []).map(d => d.id as string)))

  const { data, error } = await supabase
    .from('game_plans')
    .upsert({
      club_id: ctx.clubId,
      team_id: ctx.event.teamId,
      event_id: ctx.event.id,
      formation: doc.formation,
      lineup: doc.lineup,
      set_pieces: doc.set_pieces,
      drill_ids: doc.drill_ids,
      notes: doc.notes.trim() ? doc.notes : null,
      updated_by: ctx.userId,
    }, { onConflict: 'event_id' })
    .select('updated_at')
    .single()

  if (error || !data) {
    console.error('[game-plan] save failed:', error?.message)
    throw new Error('Could not save the game plan. Try again.')
  }
  return { updatedAt: data.updated_at as string }
}

// ─── Share with players ──────────────────────────────────────────────────────

export async function setGamePlanShared(
  ...args: Parameters<typeof _setGamePlanShared>
): Promise<ActionResult<Awaited<ReturnType<typeof _setGamePlanShared>>>> {
  try {
    return { ok: true, data: await _setGamePlanShared(...args) }
  } catch (e) {
    return toActionError(e)
  }
}

/**
 * Turn sharing on/off. The first time a plan is shared, players on the team
 * get one push ("Lineup is out for ..."). shared_notified_at is claimed with a
 * conditional update, so a double tap or a re-share never pushes twice.
 */
async function _setGamePlanShared(eventId: string, shared: boolean): Promise<{ shared: boolean; notified: number }> {
  await assertNotPreview()
  const ctx = await requireStaffGame(eventId)
  const { supabase } = ctx

  const { data: existing } = await supabase
    .from('game_plans')
    .select('id')
    .eq('event_id', ctx.event.id)
    .maybeSingle()

  if (!existing) {
    if (!shared) return { shared: false, notified: 0 }
    throw new Error('Pick a lineup before sharing the plan.')
  }

  const { error } = await supabase
    .from('game_plans')
    .update({ shared_with_players: shared, updated_by: ctx.userId })
    .eq('event_id', ctx.event.id)
  if (error) {
    console.error('[game-plan] share toggle failed:', error.message)
    throw new Error('Could not update sharing. Try again.')
  }

  let notified = 0
  if (shared) {
    const { data: claimed } = await supabase
      .from('game_plans')
      .update({ shared_notified_at: new Date().toISOString() })
      .eq('event_id', ctx.event.id)
      .is('shared_notified_at', null)
      .select('id')
    if (claimed && claimed.length > 0) {
      try {
        notified = await notifyPlayers(ctx.clubId, ctx.event)
      } catch (e) {
        console.error('[game-plan] push failed:', e)
      }
    }
  }

  revalidatePath('/dashboard/schedule')
  return { shared, notified }
}

async function notifyPlayers(clubId: string, event: { id: string; teamId: string; title: string }): Promise<number> {
  const service = createServiceClient()
  const { data: players } = await service
    .from('players')
    .select('parent_id')
    .eq('team_id', event.teamId)
    .not('parent_id', 'is', null)
  const accountIds = Array.from(new Set((players ?? []).map(p => p.parent_id as string)))
  if (accountIds.length === 0) return 0

  // Real player accounts only. An unclaimed roster row points at the head
  // coach's account, who should not get the player push.
  const { data: profiles } = await service
    .from('profiles')
    .select('id, role')
    .eq('club_id', clubId)
    .in('user_id', accountIds)
  const profileIds = (profiles ?? []).filter(p => isMember(p.role as string)).map(p => p.id as string)
  if (profileIds.length === 0) return 0

  await sendPushToProfiles(profileIds, {
    title: 'Game plan',
    message: `Lineup is out for ${event.title}`,
    url: `/dashboard/schedule/${event.id}/plan`,
    tag: `game-plan-${event.id}`,
  })
  return profileIds.length
}

// ─── Players: which events have a shared plan ───────────────────────────────

export async function getSharedGamePlanIds(
  ...args: Parameters<typeof _getSharedGamePlanIds>
): Promise<ActionResult<Awaited<ReturnType<typeof _getSharedGamePlanIds>>>> {
  try {
    return { ok: true, data: await _getSharedGamePlanIds(...args) }
  } catch (e) {
    return toActionError(e)
  }
}

/** Event ids (of those given) whose plan is shared. RLS limits it to the caller's teams. */
async function _getSharedGamePlanIds(eventIds: string[]): Promise<string[]> {
  const ids = Array.from(new Set(eventIds.filter(id => UUID_RE.test(id)))).slice(0, 300)
  if (ids.length === 0) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('game_plans')
    .select('event_id')
    .in('event_id', ids)
    .eq('shared_with_players', true)
  return (data ?? []).map(r => r.event_id as string)
}
