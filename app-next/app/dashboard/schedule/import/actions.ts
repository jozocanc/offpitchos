'use server'

// Schedule import from any file. Claude reads the file into rows; staff review
// them; saving adds new events and updates matched ones (same day, same
// opponent). Imported events don't notify the squad: a season of pushes at
// once is noise, and players see the schedule when they open it.

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { assertNotPreview } from '@/lib/admin-role'
import { isStaff } from '@/lib/constants'
import { type ActionResult, toActionError } from '@/lib/action-result'
import { extractWithTool, fileToContent } from '@/lib/document-reader'
import { DEFAULT_TIMEZONE, isoToWallDate, wallTimeToIso } from '@/lib/format-datetime'
import {
  SCHEDULE_FIELDS,
  type HomeAway,
  type ScheduleDraftRow,
  type ScheduleField,
  type ScheduleReadResult,
  type ScheduleSaveResult,
} from './types'
import {
  SCHEDULE_SYSTEM_PROMPT,
  SCHEDULE_TOOL,
  defaultMinutes,
  eventChanges,
  eventLabel,
  eventTitle,
  findEventMatch,
  isScheduleType,
  str,
  type ExistingEvent,
} from './reader'

const MAX_ROWS = 200

async function requireStaffTeam(teamId: string | null) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id, role, clubs(timezone)')
    .eq('user_id', user.id)
    .single()
  if (!profile?.club_id) throw new Error('No team found.')
  if (!isStaff(profile.role)) throw new Error('Only coaching staff can import a schedule.')
  const club = Array.isArray(profile.clubs) ? profile.clubs[0] : profile.clubs
  const timeZone = ((club as { timezone?: string } | null)?.timezone) || DEFAULT_TIMEZONE

  const service = createServiceClient()
  const [{ data: teams }, { data: venues }] = await Promise.all([
    service.from('teams').select('id, name').eq('club_id', profile.club_id).order('created_at'),
    service.from('venues').select('id, name').eq('club_id', profile.club_id),
  ])
  const list = teams ?? []
  const team = teamId ? list.find(t => t.id === teamId) : list.length === 1 ? list[0] : null
  if (!team) throw new Error(list.length === 0 ? 'Create your team first.' : 'Choose which team this schedule is for.')

  return {
    service,
    userId: user.id,
    clubId: profile.club_id as string,
    timeZone,
    team: team as { id: string; name: string },
    venues: (venues ?? []) as { id: string; name: string }[],
  }
}

type Ctx = Awaited<ReturnType<typeof requireStaffTeam>>

async function loadEvents(ctx: Ctx): Promise<ExistingEvent[]> {
  const { data } = await ctx.service
    .from('events')
    .select('id, type, title, start_time, address, venues(name)')
    .eq('team_id', ctx.team.id)
    .neq('status', 'cancelled')
  return (data ?? []).map(e => {
    const v = Array.isArray(e.venues) ? e.venues[0] : e.venues
    return {
      id: e.id as string,
      type: e.type as string,
      title: e.title as string,
      start_time: e.start_time as string,
      place: (e.address as string | null) || ((v as { name?: string } | null)?.name ?? ''),
    }
  })
}

// ─── Reading ─────────────────────────────────────────────────────────────────

export async function readScheduleFile(formData: FormData): Promise<ActionResult<ScheduleReadResult>> {
  try {
    await assertNotPreview()
    const teamIdRaw = formData.get('teamId')
    const ctx = await requireStaffTeam(typeof teamIdRaw === 'string' && teamIdRaw ? teamIdRaw : null)
    const file = formData.get('file')
    if (!(file instanceof File)) throw new Error('Choose a file to upload.')

    const today = isoToWallDate(new Date(), ctx.timeZone)
    const month = Number(today.slice(5, 7))
    const seasonYear = Number(today.slice(0, 4)) - (month < 7 ? 1 : 0)

    const input = await extractWithTool({
      system: SCHEDULE_SYSTEM_PROMPT,
      tool: SCHEDULE_TOOL,
      file: await fileToContent(file),
      instructions:
        `This is the schedule for "${ctx.team.name}". Today is ${today}; the season year is ${seasonYear}` +
        ` (a fall season continuing into ${seasonYear + 1}). Read it and call record_schedule with every event.`,
      label: 'schedule-import',
    })

    const raw = Array.isArray((input as { events?: unknown })?.events) ? (input as { events: unknown[] }).events : []
    const events = await loadEvents(ctx)
    const used = new Set<string>()
    const rows: ScheduleDraftRow[] = []

    for (const item of raw.slice(0, MAX_ROWS)) {
      if (!item || typeof item !== 'object') continue
      const o = item as Record<string, unknown>
      const date = str(o.date, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue
      const time = str(o.time, 5)
      const ha = str(o.home_away, 10)
      const row: ScheduleDraftRow = {
        key: crypto.randomUUID(),
        include: true,
        matchId: null,
        matchLabel: null,
        date,
        time: /^\d{2}:\d{2}$/.test(time) ? time : '',
        type: isScheduleType(o.type) ? o.type : 'game',
        opponent: str(o.opponent),
        home_away: (['home', 'away', 'neutral'].includes(ha) ? ha : '') as HomeAway,
        location: str(o.location, 200),
        uncertain: Array.isArray(o.uncertain_fields)
          ? o.uncertain_fields.filter((f): f is ScheduleField => (SCHEDULE_FIELDS as readonly string[]).includes(f as string))
          : [],
        changes: [],
      }
      const match = findEventMatch(row, events, used, ctx.timeZone)
      if (match) {
        used.add(match.id)
        row.matchId = match.id
        row.matchLabel = eventLabel(match, ctx.timeZone)
        row.changes = eventChanges(row, match, ctx.timeZone)
      }
      rows.push(row)
    }

    if (rows.length === 0) throw new Error('No events could be read from that file. Try a clearer copy or a different file.')
    rows.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
    return { ok: true, data: { teamId: ctx.team.id, teamName: ctx.team.name, timeZone: ctx.timeZone, rows } }
  } catch (e) {
    return toActionError(e)
  }
}

// ─── Saving ──────────────────────────────────────────────────────────────────

function norm(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]/g, '')
}

export async function saveScheduleRows(teamId: string, rows: ScheduleDraftRow[]): Promise<ActionResult<ScheduleSaveResult>> {
  try {
    await assertNotPreview()
    const ctx = await requireStaffTeam(teamId)
    const events = await loadEvents(ctx)
    const byId = new Map(events.map(e => [e.id, e]))
    const chosen = (Array.isArray(rows) ? rows : []).filter(r => r && r.include).slice(0, MAX_ROWS)
    if (chosen.length === 0) throw new Error('Tick at least one event to save.')

    const seen = new Set<string>()
    const inserts: Record<string, unknown>[] = []
    const updates: { id: string; values: Record<string, unknown> }[] = []

    for (const r of chosen) {
      const date = str(r.date, 10)
      const time = str(r.time, 5)
      const type = isScheduleType(r.type) ? r.type : 'game'
      const opponent = str(r.opponent)
      const label = opponent || date
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`${label}: date must look like 2026-10-14.`)
      if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error(`${label}: time must look like 19:00, or be left blank for TBD.`)
      if (type === 'game' && !opponent) throw new Error(`The game on ${date} needs an opponent.`)

      const ha: HomeAway = r.home_away === 'home' || r.home_away === 'away' || r.home_away === 'neutral' ? r.home_away : ''
      const title = eventTitle({ type, opponent, home_away: ha, time })
      // TBD times sit at noon so the day is right; the title says TBD.
      const start = wallTimeToIso(date, time || '12:00', ctx.timeZone)
      const end = new Date(new Date(start).getTime() + defaultMinutes(type) * 60_000).toISOString()

      // A home game at the program's only venue, or a location naming a venue, uses that venue.
      const location = str(r.location, 200)
      const venue =
        ctx.venues.find(v => location && norm(v.name) === norm(location)) ??
        (ha === 'home' && ctx.venues.length === 1 ? ctx.venues[0] : null)
      const place = venue ? { venue_id: venue.id, address: null } : { venue_id: null, address: location || null }

      if (r.matchId) {
        const e = byId.get(r.matchId)
        if (!e) throw new Error(`${title} was changed or removed. Read the file again.`)
        if (seen.has(e.id)) throw new Error(`${e.title} is matched twice. Untick one row.`)
        seen.add(e.id)
        const draft: ScheduleDraftRow = { ...r, date, time, type, opponent, home_away: ha, location }
        if (eventChanges(draft, e, ctx.timeZone).length === 0) continue
        const values: Record<string, unknown> = { title, type }
        if (time) Object.assign(values, { start_time: start, end_time: end })
        if (location) Object.assign(values, place)
        updates.push({ id: e.id, values })
      } else {
        inserts.push({
          club_id: ctx.clubId,
          team_id: ctx.team.id,
          type,
          title,
          start_time: start,
          end_time: end,
          ...place,
          status: 'scheduled',
          created_by: ctx.userId,
        })
      }
    }

    if (inserts.length > 0) {
      const { error } = await ctx.service.from('events').insert(inserts)
      if (error) throw new Error(`Save failed: ${error.message}`)
    }
    for (const u of updates) {
      const { error } = await ctx.service.from('events').update(u.values).eq('id', u.id).eq('team_id', ctx.team.id)
      if (error) throw new Error(`Save failed: ${error.message}`)
    }

    revalidatePath('/dashboard/schedule')
    revalidatePath('/dashboard')
    return { ok: true, data: { added: inserts.length, updated: updates.length } }
  } catch (e) {
    return toActionError(e)
  }
}
