import Anthropic from '@anthropic-ai/sdk'
import { createServiceClient } from '@/lib/supabase/service'
import { getClubTimezoneById } from '@/lib/club-timezone-server'
import { formatShortDate, formatTime } from '@/lib/format-datetime'

// AI Weekly Digest — once-per-week recap that pulls real data, hands the
// numbers to Haiku for narrative polish, and stores both the prose and
// the raw stats so the dashboard view can render the chart-y bits even
// if the model goes off-script.

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

export interface DigestStats {
  weekStart: string  // YYYY-MM-DD
  weekEnd: string
  clubName: string
  events: {
    total: number
    practices: number
    games: number
    cancelled: number
  }
  attendance: {
    totalRecords: number
    presentRecords: number
    rate: number  // 0-100
  }
  perTeam: {
    name: string
    ageGroup: string
    eventsRun: number
    attendanceRate: number | null
    rsvpsReceived: number
  }[]
  upcomingEvents: {
    title: string
    when: string
    teamName: string
  }[]
  feedbackHighlights: {
    playerName: string
    teamName: string
    category: string
    rating: number | null
    notes: string
  }[]
  responseGap: {
    rsvpResponseRate: number  // 0-100, % of (kids x events) that got a parent RSVP
  }
}

// Sunday at midnight (local) — anchor the week so the same day always
// produces the same week_start regardless of when the cron fires.
function startOfWeek(d: Date): Date {
  const out = new Date(d)
  out.setHours(0, 0, 0, 0)
  out.setDate(out.getDate() - out.getDay()) // Sunday
  return out
}

function fmtDate(d: Date) {
  return d.toISOString().slice(0, 10)
}

export async function collectClubStats(clubId: string, anchor: Date = new Date()): Promise<DigestStats> {
  // Resolved from clubId rather than a session: this also runs from the digest
  // cron, where there is no signed-in user. Without it the "when" strings below
  // would be built in the server's zone (UTC) and emailed to parents.
  const timezone = await getClubTimezoneById(clubId)
  const service = createServiceClient()

  const weekStart = startOfWeek(new Date(anchor.getTime() - 7 * 24 * 60 * 60 * 1000))
  const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000 - 1)

  // "Coming up" has to mean the future, whenever the digest is generated.
  // The window was anchored to weekEnd, which is right for the Sunday-night
  // send this was written for — but there is no cron, so in practice a DOC
  // clicks Generate mid-week and weekEnd is already days in the past. That
  // listed Monday's session under "Coming up" on a Wednesday. Anchoring to
  // whichever is later keeps the Sunday behaviour identical and stops the
  // on-demand case advertising sessions that already happened.
  const upcomingFrom = new Date(Math.max(weekEnd.getTime(), anchor.getTime()))

  const [{ data: club }, { data: events }, { data: teams }, { data: upcoming }, { data: rsvps }] = await Promise.all([
    service.from('clubs').select('name').eq('id', clubId).single(),
    service.from('events')
      .select('id, type, status, team_id, title, start_time, teams(name, age_group)')
      .eq('club_id', clubId)
      .gte('start_time', weekStart.toISOString())
      .lt('start_time', weekEnd.toISOString()),
    service.from('teams').select('id, name, age_group').eq('club_id', clubId),
    service.from('events')
      .select('id, title, start_time, teams(name)')
      .eq('club_id', clubId)
      .eq('status', 'scheduled')
      .gte('start_time', upcomingFrom.toISOString())
      .lte('start_time', new Date(upcomingFrom.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString())
      .order('start_time', { ascending: true })
      .limit(8),
    service.from('event_rsvps')
      .select('event_id, response, events!inner(team_id, club_id, start_time)')
      .eq('events.club_id', clubId)
      .gte('events.start_time', weekStart.toISOString())
      .lt('events.start_time', weekEnd.toISOString()),
  ])

  const eventIds = (events ?? []).map(e => e.id)
  const { data: attendance } = eventIds.length > 0
    ? await service.from('attendance').select('player_id, status, event_id').in('event_id', eventIds)
    : { data: [] as { player_id: string; status: string; event_id: string }[] }

  const totalRecords = (attendance ?? []).length
  const presentRecords = (attendance ?? []).filter(a => a.status === 'present' || a.status === 'late').length

  const eventsByTeam: Record<string, { run: number; ids: string[] }> = {}
  for (const e of events ?? []) {
    if (e.status === 'cancelled') continue
    const slot = eventsByTeam[e.team_id] ?? { run: 0, ids: [] }
    slot.run += 1
    slot.ids.push(e.id)
    eventsByTeam[e.team_id] = slot
  }

  const attByEvent = new Map<string, { total: number; present: number }>()
  for (const a of attendance ?? []) {
    const t = attByEvent.get(a.event_id) ?? { total: 0, present: 0 }
    t.total += 1
    if (a.status === 'present' || a.status === 'late') t.present += 1
    attByEvent.set(a.event_id, t)
  }

  const rsvpsByTeam: Record<string, number> = {}
  for (const r of rsvps ?? []) {
    const teamId = (Array.isArray(r.events) ? r.events[0] : r.events)?.team_id
    if (!teamId) continue
    rsvpsByTeam[teamId] = (rsvpsByTeam[teamId] ?? 0) + 1
  }

  const perTeam = (teams ?? []).map(t => {
    const slot = eventsByTeam[t.id]
    let attRate: number | null = null
    if (slot && slot.ids.length > 0) {
      let total = 0
      let present = 0
      for (const id of slot.ids) {
        const x = attByEvent.get(id)
        if (!x) continue
        total += x.total
        present += x.present
      }
      if (total > 0) attRate = Math.round((present / total) * 100)
    }
    return {
      name: t.name,
      ageGroup: t.age_group,
      eventsRun: slot?.run ?? 0,
      attendanceRate: attRate,
      rsvpsReceived: rsvpsByTeam[t.id] ?? 0,
    }
  })

  // RSVP response rate = (RSVPs received) / (player-event pairs in the
  // week). Rough but useful — tells the DOC whether parents are even
  // engaging with the new feature.
  const { data: players } = await service
    .from('players')
    .select('id, team_id')
    .eq('club_id', clubId)

  const playersByTeam: Record<string, number> = {}
  for (const p of players ?? []) {
    playersByTeam[p.team_id] = (playersByTeam[p.team_id] ?? 0) + 1
  }
  let totalPairs = 0
  for (const teamId of Object.keys(eventsByTeam)) {
    const ev = eventsByTeam[teamId].run
    totalPairs += (playersByTeam[teamId] ?? 0) * ev
  }
  const rsvpResponseRate = totalPairs > 0
    ? Math.min(100, Math.round(((rsvps ?? []).length / totalPairs) * 100))
    : 0

  // Feedback highlights — top 5 rated entries this week so the digest
  // can spotlight standouts. Coach gets to feel like the app sees their
  // notes. Parent of a featured kid gets the warm-fuzzy.
  const { data: highlights } = await service
    .from('player_feedback')
    .select('rating, notes, category, players(first_name, last_name, teams(name))')
    .eq('club_id', clubId)
    .gte('created_at', weekStart.toISOString())
    .lt('created_at', weekEnd.toISOString())
    .order('rating', { ascending: false, nullsFirst: false })
    .limit(5)

  const feedbackHighlights = (highlights ?? []).map(h => {
    const player = Array.isArray(h.players) ? h.players[0] : h.players
    const team = player ? (Array.isArray(player.teams) ? player.teams[0] : player.teams) : null
    return {
      playerName: player ? `${player.first_name} ${player.last_name}` : 'A player',
      teamName: team?.name ?? '',
      category: h.category,
      rating: h.rating,
      notes: h.notes,
    }
  })

  return {
    weekStart: fmtDate(weekStart),
    weekEnd: fmtDate(new Date(weekEnd.getTime())),
    clubName: club?.name ?? 'the club',
    events: {
      total: (events ?? []).length,
      practices: (events ?? []).filter(e => e.type === 'practice').length,
      games: (events ?? []).filter(e => e.type === 'game').length,
      cancelled: (events ?? []).filter(e => e.status === 'cancelled').length,
    },
    attendance: {
      totalRecords,
      presentRecords,
      rate: totalRecords > 0 ? Math.round((presentRecords / totalRecords) * 100) : 0,
    },
    perTeam,
    upcomingEvents: (upcoming ?? []).map(e => ({
      title: e.title,
      when: `${formatShortDate(e.start_time, timezone)} at ${formatTime(e.start_time, timezone)}`,
      teamName: (Array.isArray(e.teams) ? e.teams[0] : e.teams)?.name ?? '',
    })),
    feedbackHighlights,
    responseGap: {
      rsvpResponseRate,
    },
  }
}

const DIGEST_SYSTEM = `You are Pep AI, the OffPitchOS club assistant. Write a weekly digest that anyone in the club can skim in under 30 seconds.

Tone: warm, direct, slightly proud — like a great club president would email.
Style: markdown. Short sections. Real names. Specific numbers.
Length: 200–280 words total.
NEVER invent data. If a stat is zero or missing, just say so or skip it.

Structure:
1. One-line greeting that names the club and the week.
2. A "What happened" section with 3-5 bullet points of real numbers (events run, attendance rate, etc).
3. A "Standouts" section spotlighting 2–3 players from feedbackHighlights, calling out the coach note in plain language.
4. A "Coming up" section listing the next 3-4 events with day + team.
5. One-line sign-off.

Do NOT include a literal "Date:" or "Week:" header. Do NOT include disclaimers.`

export async function generateDigestProse(stats: DigestStats): Promise<string> {
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 700,
    system: DIGEST_SYSTEM,
    messages: [
      {
        role: 'user',
        content: `Generate the weekly digest for ${stats.clubName}, week of ${stats.weekStart} to ${stats.weekEnd}.

Raw stats (only use real data from here):
${JSON.stringify(stats, null, 2)}`,
      },
    ],
  })

  const block = message.content[0]
  if (block.type === 'text') return block.text
  return `# Weekly Recap\n\nDigest could not be generated — please try again later.`
}

export async function generateAndStoreDigest(clubId: string, generatedBy: string | null = null): Promise<{ id: string; weekStart: string; markdown: string; stats: DigestStats }> {
  const stats = await collectClubStats(clubId)
  const markdown = await generateDigestProse(stats)

  const service = createServiceClient()
  // Upsert by (club_id, week_start) so re-running the generator on the
  // same Sunday overwrites the prose instead of throwing on the unique
  // constraint. The DOC clicks "Regenerate", we replace.
  const { data, error } = await service
    .from('weekly_digests')
    .upsert(
      {
        club_id: clubId,
        week_start: stats.weekStart,
        summary_md: markdown,
        stats: stats as unknown as Record<string, unknown>,
        generated_by: generatedBy,
      },
      { onConflict: 'club_id,week_start' }
    )
    .select('id, week_start, summary_md')
    .single()

  if (error) throw new Error(`Failed to store digest: ${error.message}`)

  return {
    id: data.id,
    weekStart: data.week_start,
    markdown: data.summary_md,
    stats,
  }
}
