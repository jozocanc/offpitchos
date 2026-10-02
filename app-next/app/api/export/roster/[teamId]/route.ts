import { createClient } from '@/lib/supabase/server'
import { isStaff, gearSizeLabel } from '@/lib/constants'
import { toCsv, csvResponse, fileSlug } from '@/lib/csv'

// Roster download for staff: one row per player with their profile details
// and season totals from saved game reports. RLS already limits players and
// stats to the viewer's own club; the club filter below is belt and braces.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export async function GET(_req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params
  if (!UUID_RE.test(teamId)) return new Response('Not found', { status: 404 })

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, club_id')
    .eq('user_id', user.id)
    .single()
  if (!profile?.club_id || !isStaff(profile.role)) return new Response('Forbidden', { status: 403 })

  const [{ data: team }, { data: club }] = await Promise.all([
    supabase.from('teams').select('id, name').eq('id', teamId).eq('club_id', profile.club_id).maybeSingle(),
    supabase.from('clubs').select('name, created_by').eq('id', profile.club_id).single(),
  ])
  if (!team) return new Response('Not found', { status: 404 })

  const [{ data: players }, { data: stats }] = await Promise.all([
    supabase
      .from('players')
      .select('id, first_name, last_name, jersey_number, position, notes, jersey_size, shorts_size, date_of_birth, emergency_contact_name, emergency_contact_phone, dietary_notes, passport_expiry, has_travel_id, parent_id')
      .eq('team_id', teamId)
      .eq('club_id', profile.club_id),
    supabase
      .from('player_game_stats')
      .select('player_id, started, minutes, goals, assists, yellow_cards, red_cards')
      .eq('team_id', teamId)
      .eq('club_id', profile.club_id),
  ])

  const totals = new Map<string, { gp: number; gs: number; min: number; g: number; a: number; yc: number; rc: number }>()
  for (const s of stats ?? []) {
    const t = totals.get(s.player_id) ?? { gp: 0, gs: 0, min: 0, g: 0, a: 0, yc: 0, rc: 0 }
    t.gp += 1
    if (s.started) t.gs += 1
    t.min += s.minutes ?? 0
    t.g += s.goals
    t.a += s.assists
    t.yc += s.yellow_cards
    t.rc += s.red_cards
    totals.set(s.player_id, t)
  }

  const sorted = [...(players ?? [])].sort((a, b) =>
    (a.jersey_number ?? 999) - (b.jersey_number ?? 999) || a.last_name.localeCompare(b.last_name),
  )

  const header = [
    'Number', 'First name', 'Last name', 'Position', 'Notes', 'Jersey size', 'Shorts size',
    'Date of birth', 'Emergency contact', 'Emergency phone', 'Dietary notes', 'Passport expiry',
    'Travel ID', 'On the app', 'Games', 'Starts', 'Minutes', 'Goals', 'Assists', 'Yellow cards', 'Red cards',
  ]
  const rows = sorted.map(p => {
    const t = totals.get(p.id)
    return [
      p.jersey_number, p.first_name, p.last_name, p.position, p.notes,
      p.jersey_size ? gearSizeLabel(p.jersey_size) : '', p.shorts_size ? gearSizeLabel(p.shorts_size) : '',
      p.date_of_birth, p.emergency_contact_name, p.emergency_contact_phone, p.dietary_notes, p.passport_expiry,
      p.has_travel_id === null ? '' : p.has_travel_id,
      // Unclaimed roster rows are owned by the head coach's account.
      Boolean(p.parent_id && p.parent_id !== club?.created_by),
      t?.gp ?? 0, t?.gs ?? 0, t?.min ?? 0, t?.g ?? 0, t?.a ?? 0, t?.yc ?? 0, t?.rc ?? 0,
    ]
  })

  const name = `${fileSlug(club?.name ?? team.name)}-roster.csv`
  return csvResponse(toCsv(header, rows), name)
}
