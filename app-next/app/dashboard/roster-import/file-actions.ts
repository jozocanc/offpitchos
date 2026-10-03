'use server'

// Roster import from any file (PDF, photo/screenshot, Excel, CSV, Word, text).
// Claude reads the file into rows; staff review them in an editable table;
// saving adds new players and updates matched ones. Nothing is written until
// saveRosterRows. Players are added unclaimed and claim their row when they
// join with the team code.

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { assertNotPreview } from '@/lib/admin-role'
import { isStaff } from '@/lib/constants'
import { type ActionResult, toActionError } from '@/lib/action-result'
import { extractWithTool, fileToContent } from '@/lib/document-reader'
import { ROSTER_TOOL, ROSTER_SYSTEM_PROMPT, str, findMatch, changedFields, playerLabel, type ExistingPlayer } from './lib/roster-reader'
import { bustAttentionCache } from '../attention-actions'
import { normalizeDate } from './lib/normalize'
import {
  ROSTER_FIELDS,
  type RosterDraftRow,
  type RosterField,
  type RosterReadResult,
  type RosterSaveResult,
} from './lib/file-types'

const MAX_ROWS = 200


/** Staff caller + a team in their club. With no teamId, the club's only team. */
async function requireStaffTeam(teamId: string | null) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id, role')
    .eq('user_id', user.id)
    .single()
  if (!profile?.club_id) throw new Error('No team found.')
  if (!isStaff(profile.role)) throw new Error('Only coaching staff can import a roster.')

  const service = createServiceClient()
  const { data: teams } = await service
    .from('teams')
    .select('id, name')
    .eq('club_id', profile.club_id)
    .order('created_at')
  const list = teams ?? []
  const team = teamId ? list.find(t => t.id === teamId) : list.length === 1 ? list[0] : null
  if (!team) throw new Error(list.length === 0 ? 'Create your team first.' : 'Choose which team this roster is for.')

  return { service, clubId: profile.club_id as string, team: team as { id: string; name: string } }
}

async function loadPlayers(service: ReturnType<typeof createServiceClient>, teamId: string): Promise<ExistingPlayer[]> {
  const { data } = await service
    .from('players')
    .select('id, first_name, last_name, jersey_number, position, date_of_birth')
    .eq('team_id', teamId)
  return (data ?? []) as ExistingPlayer[]
}

// ─── Reading ─────────────────────────────────────────────────────────────────

export async function readRosterFile(formData: FormData): Promise<ActionResult<RosterReadResult>> {
  try {
    await assertNotPreview()
    const teamIdRaw = formData.get('teamId')
    const ctx = await requireStaffTeam(typeof teamIdRaw === 'string' && teamIdRaw ? teamIdRaw : null)
    const file = formData.get('file')
    if (!(file instanceof File)) throw new Error('Choose a file to upload.')

    const content = await fileToContent(file)
    const input = await extractWithTool({
      system: ROSTER_SYSTEM_PROMPT,
      tool: ROSTER_TOOL,
      file: content,
      instructions: `This is the roster for "${ctx.team.name}". Read it and call record_roster with every player.`,
      label: 'roster-import',
    })

    const raw = Array.isArray((input as { players?: unknown })?.players) ? (input as { players: unknown[] }).players : []
    const players = await loadPlayers(ctx.service, ctx.team.id)
    const used = new Set<string>()
    const rows: RosterDraftRow[] = []

    for (const item of raw.slice(0, MAX_ROWS)) {
      if (!item || typeof item !== 'object') continue
      const o = item as Record<string, unknown>
      const first = str(o.first_name)
      const last = str(o.last_name)
      if (!first && !last) continue
      const dob = normalizeDate(str(o.date_of_birth, 20))
      const extra = [str(o.class_year, 20), str(o.height, 20), str(o.hometown, 120)].filter(Boolean).join(' · ')
      const row: RosterDraftRow = {
        key: crypto.randomUUID(),
        include: true,
        matchId: null,
        matchLabel: null,
        first_name: first,
        last_name: last,
        jersey_number: str(o.jersey_number, 3).replace(/\D/g, ''),
        position: str(o.position, 40),
        date_of_birth: dob.iso ?? '',
        extra,
        uncertain: Array.isArray(o.uncertain_fields)
          ? o.uncertain_fields.filter((f): f is RosterField => (ROSTER_FIELDS as readonly string[]).includes(f as string))
          : [],
        changes: [],
      }
      const match = findMatch(row, players, used)
      if (match) {
        used.add(match.id)
        row.matchId = match.id
        row.matchLabel = playerLabel(match)
        row.changes = changedFields(row, match)
      }
      rows.push(row)
    }

    if (rows.length === 0) throw new Error('No players could be read from that file. Try a clearer copy or a different file.')
    return { ok: true, data: { teamId: ctx.team.id, teamName: ctx.team.name, rows, existingCount: players.length } }
  } catch (e) {
    return toActionError(e)
  }
}

// ─── Saving ──────────────────────────────────────────────────────────────────

function cleanJersey(v: string, who: string): number | null {
  const t = v.trim()
  if (!t) return null
  if (!/^\d{1,2}$/.test(t)) throw new Error(`${who}: jersey number must be 0 to 99.`)
  return parseInt(t, 10)
}

function cleanDob(v: string, who: string): string | null {
  const t = v.trim()
  if (!t) return null
  const d = normalizeDate(t)
  if (!d.iso) throw new Error(`${who}: date of birth must be a full date like 2006-04-21.`)
  return d.iso
}

export async function saveRosterRows(teamId: string, rows: RosterDraftRow[]): Promise<ActionResult<RosterSaveResult>> {
  try {
    await assertNotPreview()
    const ctx = await requireStaffTeam(teamId)
    const players = await loadPlayers(ctx.service, ctx.team.id)
    const byId = new Map(players.map(p => [p.id, p]))
    const chosen = (Array.isArray(rows) ? rows : []).filter(r => r && r.include).slice(0, MAX_ROWS)
    if (chosen.length === 0) throw new Error('Tick at least one player to save.')

    const seen = new Set<string>()
    const inserts: Record<string, unknown>[] = []
    const updates: { id: string; values: Record<string, unknown> }[] = []

    for (const r of chosen) {
      const first = str(r.first_name)
      const last = str(r.last_name)
      const who = `${first} ${last}`.trim() || 'A player'
      const jersey = cleanJersey(String(r.jersey_number ?? ''), who)
      const position = str(r.position, 40) || null
      const dob = cleanDob(String(r.date_of_birth ?? ''), who)

      if (r.matchId) {
        const p = byId.get(r.matchId)
        if (!p) throw new Error(`${who} is no longer on this team. Read the file again.`)
        if (seen.has(p.id)) throw new Error(`${playerLabel(p)} is matched twice. Untick one row.`)
        seen.add(p.id)
        // Only fill in or change what the file has; never blank a saved value.
        const values: Record<string, unknown> = {}
        if (jersey != null && jersey !== p.jersey_number) values.jersey_number = jersey
        if (position && position.toLowerCase() !== (p.position ?? '').toLowerCase()) values.position = position
        if (dob && dob !== p.date_of_birth) values.date_of_birth = dob
        if (Object.keys(values).length > 0) updates.push({ id: p.id, values })
      } else {
        if (!first || !last) throw new Error('Every new player needs a first and last name.')
        inserts.push({
          club_id: ctx.clubId,
          team_id: ctx.team.id,
          parent_id: null,
          first_name: first,
          last_name: last,
          jersey_number: jersey,
          position,
          date_of_birth: dob,
          notes: str(r.extra, 200) || null,
        })
      }
    }

    if (inserts.length > 0) {
      const { error } = await ctx.service.from('players').insert(inserts)
      if (error) throw new Error(`Save failed: ${error.message}`)
    }
    for (const u of updates) {
      const { error } = await ctx.service.from('players').update(u.values).eq('id', u.id).eq('team_id', ctx.team.id)
      if (error) throw new Error(`Save failed: ${error.message}`)
    }

    await bustAttentionCache(ctx.clubId)
    revalidatePath(`/dashboard/teams/${ctx.team.id}`)
    revalidatePath('/dashboard/teams')
    revalidatePath('/dashboard')
    return { ok: true, data: { added: inserts.length, updated: updates.length } }
  } catch (e) {
    return toActionError(e)
  }
}
