import { cache } from 'react'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { getAuthUserId, getCurrentProfile } from '@/lib/current-profile'
import { ROLES, type Role } from '@/lib/constants'

// Parent is deliberately absent: the product is team-only now, so there is no
// parent view left to preview.
const VIEWABLE_ROLES: readonly string[] = [ROLES.DOC, ROLES.PLAYER]

/**
 * A DOC may preview the app as one of their own coaches or players. Nobody
 * else can. This is a strict downgrade — a DOC already outranks both roles, so
 * the switch never grants privilege, and every write is still checked by RLS
 * against the real JWT regardless of what this returns.
 *
 * Was gated on a hardcoded admin email until 2026-08-16, which meant only Jozo
 * could use the switcher.
 */
export function canSwitchRole(actualRole: string | null | undefined): boolean {
  return actualRole === ROLES.DOC
}

export async function getEffectiveRole(actualRole: string): Promise<string> {
  if (!canSwitchRole(actualRole)) return actualRole

  const cookieStore = await cookies()
  const viewAs = cookieStore.get('viewAsRole')?.value
  if (viewAs && VIEWABLE_ROLES.includes(viewAs)) {
    return viewAs as Role
  }

  return actualRole
}

// ---------------------------------------------------------------------------
// Player preview ("View as → Player")
//
// Swapping the role alone leaves a DOC looking at an empty "you're not on a
// team" state, because every member-scoped read is keyed off the viewer's own
// auth id (players.parent_id = me). In preview we substitute a real sample
// player from the DOC's own club so the head coach sees exactly what that
// player sees. The DOC's own Supabase client can already read every row in the
// club under RLS (players_doc_all and friends), so only the id in the filter
// changes: no service client, no privilege gained.
//
// Writes are NEVER performed as the sample player: see assertNotPreview().
// ---------------------------------------------------------------------------

export const PREVIEW_WRITE_ERROR =
  'Preview mode: actions are disabled while viewing as a player.'

export interface PreviewPlayer {
  /** players.id of the sample roster row */
  playerId: string
  firstName: string
  lastName: string
  jerseyNumber: number | null
  teamId: string
  teamName: string
}

export interface ViewerIdentity {
  /** Auth user id to use in member-scoped filters (parent_id, responded_by…). */
  userId: string
  /** profiles.id to use in member-scoped filters (team_members.profile_id…). */
  profileId: string | null
  /** True whenever a DOC is viewing as a player, even if no sample was found. */
  isPreview: boolean
  /** The sample roster row, or null (not previewing, or nobody has joined yet). */
  previewPlayer: PreviewPlayer | null
  /** The real signed-in user, always. Use for writes and for staff checks. */
  realUserId: string
  realProfileId: string | null
}

async function readViewAsCookie(): Promise<string | undefined> {
  const cookieStore = await cookies()
  return cookieStore.get('viewAsRole')?.value
}

/**
 * Pick the club's sample player: a member account (role 'player', or legacy
 * 'parent') that owns at least one roster row in the club. Deterministic:
 * players who joined that team first, then lowest jersey number (unnumbered
 * rows last), then last name, then id.
 */
async function pickPreviewPlayer(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clubId: string,
): Promise<{ userId: string; profileId: string; player: PreviewPlayer } | null> {
  const { data: memberProfiles } = await supabase
    .from('profiles')
    .select('id, user_id')
    .eq('club_id', clubId)
    .in('role', [ROLES.PLAYER, ROLES.PARENT])

  const profileByUser = new Map<string, string>()
  for (const p of memberProfiles ?? []) {
    if (p.user_id) profileByUser.set(p.user_id as string, p.id as string)
  }
  if (profileByUser.size === 0) return null

  const { data: rows } = await supabase
    .from('players')
    .select('id, first_name, last_name, jersey_number, parent_id, team_id, teams!inner(name, club_id)')
    .eq('club_id', clubId)
    .in('parent_id', Array.from(profileByUser.keys()))

  type Row = {
    id: string
    first_name: string
    last_name: string
    jersey_number: number | null
    parent_id: string | null
    team_id: string
    teams: { name: string; club_id: string } | { name: string; club_id: string }[] | null
  }

  const owned = ((rows ?? []) as unknown as Row[])
    .map(r => ({ ...r, team: Array.isArray(r.teams) ? r.teams[0] : r.teams }))
    .filter(r => r.parent_id && r.team && r.team.club_id === clubId)
  if (owned.length === 0) return null

  // Prefer players who actually joined the team (a team_members row for that
  // team): every member screen hangs off that membership, so a player with a
  // roster row but no membership would preview as mostly empty.
  const { data: memberships } = await supabase
    .from('team_members')
    .select('profile_id, team_id')
    .in('profile_id', Array.from(new Set(owned.map(r => profileByUser.get(r.parent_id as string) as string))))
  const joined = new Set((memberships ?? []).map(m => `${m.profile_id}:${m.team_id}`))
  const hasJoined = (r: (typeof owned)[number]) =>
    joined.has(`${profileByUser.get(r.parent_id as string)}:${r.team_id}`) ? 0 : 1

  const candidates = owned
    .sort((a, b) => {
      const jd = hasJoined(a) - hasJoined(b)
      if (jd !== 0) return jd
      const ja = a.jersey_number ?? Number.MAX_SAFE_INTEGER
      const jb = b.jersey_number ?? Number.MAX_SAFE_INTEGER
      if (ja !== jb) return ja - jb
      const ln = (a.last_name ?? '').localeCompare(b.last_name ?? '')
      if (ln !== 0) return ln
      return a.id.localeCompare(b.id)
    })

  const pick = candidates[0]
  if (!pick || !pick.parent_id) return null
  const profileId = profileByUser.get(pick.parent_id)
  if (!profileId) return null

  return {
    userId: pick.parent_id,
    profileId,
    player: {
      playerId: pick.id,
      firstName: pick.first_name,
      lastName: pick.last_name,
      jerseyNumber: pick.jersey_number,
      teamId: pick.team_id,
      teamName: pick.team?.name ?? 'Team',
    },
  }
}

/**
 * Who member-scoped reads should be "for". Request-memoized.
 *
 * Returns the sample player's ids when the actual role is DOC and the
 * effective role is player; otherwise the signed-in user's own ids. When a DOC
 * previews a club where no player has joined yet, returns the real ids with
 * isPreview=true and previewPlayer=null so the UI can explain instead of
 * showing a broken empty state.
 */
export const getViewerIdentity = cache(async (): Promise<ViewerIdentity> => {
  // Shares the request-memoized claims + profile read with the layout, the
  // page and getClubTimezone(), instead of issuing its own.
  const realUserId = (await getAuthUserId()) ?? ''
  const profile = realUserId ? await getCurrentProfile() : null

  const realProfileId = (profile?.id as string | undefined) ?? null
  const real: ViewerIdentity = {
    userId: realUserId,
    profileId: realProfileId,
    isPreview: false,
    previewPlayer: null,
    realUserId,
    realProfileId,
  }

  if (!profile || !canSwitchRole(profile.role)) return real
  const effective = await getEffectiveRole(profile.role as string)
  if (effective !== ROLES.PLAYER) return real

  const supabase = await createClient()
  const sample = profile.club_id
    ? await pickPreviewPlayer(supabase, profile.club_id as string)
    : null

  if (!sample) return { ...real, isPreview: true }

  return {
    userId: sample.userId,
    profileId: sample.profileId,
    isPreview: true,
    previewPlayer: sample.player,
    realUserId,
    realProfileId,
  }
})

/** Alias kept for readability at call sites that only need the sample. */
export async function getPreviewPlayer(): Promise<PreviewPlayer | null> {
  return (await getViewerIdentity()).previewPlayer
}

/**
 * True when the signed-in user is a DOC viewing as a player. Cheap: reads the
 * cookie first and only touches the DB when the cookie says 'player'.
 */
export async function isPlayerPreview(): Promise<boolean> {
  if ((await readViewAsCookie()) !== ROLES.PLAYER) return false
  return (await getViewerIdentity()).isPreview
}

/**
 * Call at the top of every member write (RSVP, can't-attend, claim, poll
 * vote, gear sizes, camp register, DM as player). Throws so the action's
 * existing toActionError wrapper turns it into { ok: false, error }.
 */
export async function assertNotPreview(): Promise<void> {
  if (await isPlayerPreview()) throw new Error(PREVIEW_WRITE_ERROR)
}
