'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// In-memory cache so every dashboard visit doesn't retrigger a Claude call.
// TTL is short enough that the DOC still sees fresh data, but long enough
// to cover typical navigation patterns (visit → navigate away → come back).
const ATTENTION_CACHE_TTL_MS = 2 * 60 * 1000 // 2 minutes
const attentionCache = new Map<string, { data: AttentionResult; expiresAt: number }>()

function readCache(key: string): AttentionResult | null {
  const entry = attentionCache.get(key)
  if (!entry) return null
  if (Date.now() > entry.expiresAt) {
    attentionCache.delete(key)
    return null
  }
  return entry.data
}

function writeCache(key: string, data: AttentionResult) {
  attentionCache.set(key, { data, expiresAt: Date.now() + ATTENTION_CACHE_TTL_MS })
}

export interface AttentionItem {
  id: string
  title: string
  description: string
  urgency: 'critical' | 'important' | 'routine'
  actionLabel: string
  actionHref: string
}

export interface AttentionResult {
  items: AttentionItem[]
  totalSignals: number
  generatedAt: string
}

async function getUserProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, club_id, role')
    .eq('user_id', user.id)
    .single()

  if (!profile?.club_id) throw new Error('No club found')
  return { user, profile, supabase }
}

const ATTENTION_PROMPT = `You are triaging the inbox of a soccer club Director of Coaching (DOC).

Your job: from the raw signals below, produce a short prioritized list of things the DOC needs to act on RIGHT NOW. This is what they see when they sit down at their desk.

STRICT RULES:
- You may ONLY return items that reference a signalId from the list below. Do NOT invent new items.
- Each item's signalId must match a signal id in the input EXACTLY.
- If there are no signals, return {"items": []}.
- Return at most 5 items.
- Sort by urgency: critical first, then important, then routine.
- Keep descriptions SHORT — under 80 characters.

URGENCY GUIDANCE (by signal type):
- "critical" — time pressure or breakdowns. Examples: coverage requests that are EXPIRED or expire in <30 min; events starting in <2 hours without coverage resolved.
- "important" — act this week. Examples: coverage pending with time, new parent replies, upcoming games in next 48h, past events with no attendance marked (coach may have forgotten), gear sizes missing for many players, camps with unpaid registrations.
- "routine" — awareness / FYI. Examples: upcoming events going smoothly, stale pending invites that may need a resend, 1-2 gear sizes missing, small camp payment gap.

DEDUPLICATION:
- If multiple signals describe the same underlying problem, pick the single best one.
- Prefer aggregate signals (like "12 players missing gear") over per-item signals when they cover the same ground.
- "gear-missing" is a single aggregate — treat it as ONE item even though it covers many players.

ACTION LABELS:
- Clicking a card ONLY navigates the user to the relevant page. The card itself does NOT take the action.
- Use ONLY these labels (pick the most appropriate one):
  - "Review" — for most things (coverage, gear, camps, invites, attendance gaps)
  - "Open" — for parent replies on announcements
  - "View" — for upcoming scheduled events
- Do NOT use labels like "Confirm", "Assign", "Cancel", "Reply", "Send", "Approve" — these imply the card itself does the action, which is wrong.

SIGNAL ID FORMATS (for reference only — use the exact IDs from the signals list):
- coverage-<uuid> — active coverage request
- event-<uuid> — upcoming event in next 48h
- reply-<uuid> — recent reply to your announcement
- gear-missing — aggregate: players missing gear sizes
- invite-<uuid> — pending invite older than 3 days
- attendance-<uuid> — past event without attendance marked
- camp-unpaid-<uuid> — camp with unpaid registrations

Return JSON only, no preamble, no markdown. Match this exact schema:
{
  "items": [
    {
      "signalId": "<exact id from signals list>",
      "title": "Short title (max 5 words)",
      "description": "One sentence under 80 chars",
      "urgency": "critical",
      "actionLabel": "Review"
    }
  ]
}`

export async function getAttentionList(timeZone: string = 'UTC', forceRefresh: boolean = false): Promise<AttentionResult> {
  const { profile, supabase } = await getUserProfile()

  // Only DOCs get the triaged attention list
  if (profile.role !== 'doc') {
    return { items: [], totalSignals: 0, generatedAt: new Date().toISOString() }
  }

  // Per-club cache (the data is club-scoped, not user-scoped)
  const cacheKey = `${profile.club_id}:${timeZone}`
  if (!forceRefresh) {
    const cached = readCache(cacheKey)
    if (cached) return cached
  }

  const now = new Date()
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000)
  const past48h = new Date(now.getTime() - 48 * 60 * 60 * 1000)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)

  // Gather signals in parallel
  const [
    coverageRes,
    upcomingRes,
    repliesRes,
    gearRes,
    invitesRes,
    pastEventsRes,
    attendanceRes,
    unpaidCampsRes,
  ] = await Promise.all([
    // Active coverage requests
    supabase
      .from('coverage_requests')
      .select('id, status, timeout_at, events(id, title, start_time, teams(name, age_group))')
      .eq('club_id', profile.club_id)
      .in('status', ['pending', 'escalated'])
      .order('timeout_at', { ascending: true })
      .limit(10),
    // Upcoming events in next 48h
    supabase
      .from('events')
      .select('id, title, start_time, type, status, teams(name, age_group)')
      .eq('club_id', profile.club_id)
      .eq('status', 'scheduled')
      .gte('start_time', now.toISOString())
      .lte('start_time', in48h.toISOString())
      .order('start_time')
      .limit(10),
    // Recent replies to the DOC's announcements
    supabase
      .from('announcement_replies')
      .select('id, body, created_at, announcements!inner(id, title, author_id)')
      .eq('announcements.author_id', profile.id)
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: false })
      .limit(10),
    // Players with missing gear sizes (aggregate count)
    supabase
      .from('players')
      .select('id, first_name, last_name', { count: 'exact' })
      .eq('club_id', profile.club_id)
      .or('jersey_size.is.null,shorts_size.is.null')
      .limit(1),
    // Pending invites older than 3 days
    supabase
      .from('invites')
      .select('id, email, role, created_at')
      .eq('club_id', profile.club_id)
      .eq('status', 'pending')
      .lt('created_at', threeDaysAgo.toISOString())
      .order('created_at', { ascending: true })
      .limit(10),
    // Past 48h scheduled events (candidates for "attendance not marked")
    supabase
      .from('events')
      .select('id, title, start_time, teams(name, age_group)')
      .eq('club_id', profile.club_id)
      .eq('status', 'scheduled')
      .gte('start_time', past48h.toISOString())
      .lt('start_time', now.toISOString())
      .order('start_time', { ascending: false })
      .limit(20),
    // Attendance rows for events in the past 48h — used to filter pastEvents to "unmarked"
    supabase
      .from('attendance')
      .select('event_id, events!inner(club_id, start_time)')
      .eq('events.club_id', profile.club_id)
      .gte('events.start_time', past48h.toISOString())
      .lt('events.start_time', now.toISOString()),
    // Camps with unpaid registrations (only upcoming or recent camps)
    supabase
      .from('camp_registrations')
      .select('id, payment_status, camp_details!inner(id, fee_cents, club_id, events!inner(id, title, start_time, status))')
      .eq('camp_details.club_id', profile.club_id)
      .eq('payment_status', 'unpaid')
      .gte('camp_details.events.start_time', sevenDaysAgo.toISOString())
      .limit(100),
  ])

  const coverage = coverageRes.data ?? []
  const upcoming = upcomingRes.data ?? []
  const replies = repliesRes.data ?? []
  const missingGearCount = gearRes.count ?? 0
  const pendingInvites = invitesRes.data ?? []
  const pastEvents = pastEventsRes.data ?? []
  const attendanceRows = attendanceRes.data ?? []
  const unpaidCampRegs = unpaidCampsRes.data ?? []

  // Derive "past events without attendance" by filtering pastEvents against attendance event_ids
  const markedEventIds = new Set(attendanceRows.map(a => a.event_id))
  const unmarkedPastEvents = pastEvents.filter(e => !markedEventIds.has(e.id))

  // Normalize joined rows (supabase can return nested as object or array depending on runtime)
  const unwrap = <T>(v: any): T | null => {
    if (!v) return null
    if (Array.isArray(v)) return (v[0] ?? null) as T
    return v as T
  }

  // Build a map of valid signalIds → href so Claude can't hallucinate URLs or items
  const hrefBySignalId = new Map<string, string>()

  const signalParts: string[] = []
  signalParts.push(`CURRENT TIME (timezone ${timeZone}): ${now.toLocaleString('en-US', { timeZone })}`)

  if (coverage.length > 0) {
    signalParts.push(`\n## Active coverage requests (${coverage.length})`)
    for (const c of coverage) {
      const event = unwrap<any>(c.events)
      const team = unwrap<any>(event?.teams)
      const eventTime = event?.start_time ? new Date(event.start_time).toLocaleString('en-US', { timeZone }) : 'unknown time'
      const expiresIn = new Date(c.timeout_at).getTime() - now.getTime()
      const expiresStr = expiresIn < 0
        ? `EXPIRED ${Math.round(-expiresIn / 60000)} min ago`
        : `expires in ${Math.round(expiresIn / 60000)} min`
      const signalId = `coverage-${c.id}`
      hrefBySignalId.set(signalId, '/dashboard/coverage')
      signalParts.push(`- signalId=${signalId} | status=${c.status} | team=${team?.name ?? 'unknown'} | event="${event?.title ?? 'unknown'}" at ${eventTime} | ${expiresStr}`)
    }
  }

  if (upcoming.length > 0) {
    signalParts.push(`\n## Upcoming events in next 48h (${upcoming.length})`)
    for (const e of upcoming) {
      const team = unwrap<any>(e.teams)
      const startStr = new Date(e.start_time).toLocaleString('en-US', { timeZone })
      const hoursFromNow = Math.round((new Date(e.start_time).getTime() - now.getTime()) / 3600000)
      const signalId = `event-${e.id}`
      hrefBySignalId.set(signalId, `/dashboard/schedule?highlight=${e.id}`)
      signalParts.push(`- signalId=${signalId} | team=${team?.name ?? 'unknown'} | ${e.type}: "${e.title}" at ${startStr} (in ${hoursFromNow}h)`)
    }
  }

  if (replies.length > 0) {
    signalParts.push(`\n## Recent replies to your announcements (${replies.length})`)
    for (const r of replies) {
      const ann = unwrap<any>(r.announcements)
      const when = new Date(r.created_at).toLocaleString('en-US', { timeZone })
      const snippet = (r.body ?? '').slice(0, 100).replace(/\n/g, ' ')
      const signalId = `reply-${r.id}`
      hrefBySignalId.set(signalId, '/dashboard/messages')
      signalParts.push(`- signalId=${signalId} | reply="${snippet}" on "${ann?.title ?? 'announcement'}" at ${when}`)
    }
  }

  // Gear sizes missing — aggregate single signal
  if (missingGearCount > 0) {
    const signalId = `gear-missing`
    hrefBySignalId.set(signalId, '/dashboard/gear')
    signalParts.push(`\n## Gear sizes missing`)
    signalParts.push(`- signalId=${signalId} | ${missingGearCount} players in the club are missing jersey or shorts sizes. DOC can request them from parents with one click on the Gear page.`)
  }

  // Pending invites (older than 3 days)
  if (pendingInvites.length > 0) {
    signalParts.push(`\n## Pending invites older than 3 days (${pendingInvites.length})`)
    for (const inv of pendingInvites) {
      const signalId = `invite-${inv.id}`
      // Coaches go to coaches page, parents go to the team page
      hrefBySignalId.set(signalId, inv.role === 'coach' ? '/dashboard/coaches' : '/dashboard/teams')
      const daysOld = Math.floor((now.getTime() - new Date(inv.created_at).getTime()) / 86400000)
      signalParts.push(`- signalId=${signalId} | ${inv.role} invite to ${inv.email ?? 'unknown email'} is ${daysOld} days old and still pending`)
    }
  }

  // Past events missing attendance
  if (unmarkedPastEvents.length > 0) {
    signalParts.push(`\n## Past 48h events without attendance marked (${unmarkedPastEvents.length})`)
    for (const e of unmarkedPastEvents) {
      const signalId = `attendance-${e.id}`
      hrefBySignalId.set(signalId, `/dashboard/schedule?highlight=${e.id}`)
      const team = unwrap<any>(e.teams)
      const when = new Date(e.start_time).toLocaleString('en-US', { timeZone })
      signalParts.push(`- signalId=${signalId} | ${team?.name ?? 'Team'} event "${e.title}" on ${when} has no attendance marked`)
    }
  }

  // Unpaid camp registrations — group by camp event
  if (unpaidCampRegs.length > 0) {
    // Group registrations by the event id of the camp
    const byCamp = new Map<string, { title: string; start: string; count: number; feeCents: number }>()
    for (const reg of unpaidCampRegs) {
      const cd = unwrap<any>(reg.camp_details)
      const ev = unwrap<any>(cd?.events)
      if (!ev?.id) continue
      const existing = byCamp.get(ev.id)
      if (existing) {
        existing.count++
      } else {
        byCamp.set(ev.id, {
          title: ev.title ?? 'Camp',
          start: ev.start_time ?? now.toISOString(),
          count: 1,
          feeCents: cd?.fee_cents ?? 0,
        })
      }
    }
    if (byCamp.size > 0) {
      signalParts.push(`\n## Camps with unpaid registrations (${byCamp.size})`)
      for (const [eventId, info] of byCamp) {
        const signalId = `camp-unpaid-${eventId}`
        hrefBySignalId.set(signalId, '/dashboard/camps')
        const whenStr = new Date(info.start).toLocaleDateString('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' })
        const dollars = info.feeCents > 0 ? ` ($${((info.feeCents * info.count) / 100).toFixed(0)} outstanding)` : ''
        signalParts.push(`- signalId=${signalId} | Camp "${info.title}" on ${whenStr} has ${info.count} unpaid registration${info.count === 1 ? '' : 's'}${dollars}`)
      }
    }
  }

  if (signalParts.length === 1) {
    // Only the header — no signals at all
    const empty: AttentionResult = {
      items: [],
      totalSignals: 0,
      generatedAt: now.toISOString(),
    }
    writeCache(cacheKey, empty)
    return empty
  }

  const signalsText = signalParts.join('\n')
  const totalSignals =
    coverage.length +
    upcoming.length +
    replies.length +
    (missingGearCount > 0 ? 1 : 0) +
    pendingInvites.length +
    unmarkedPastEvents.length +
    unpaidCampRegs.length

  // Call Claude to triage
  let items: AttentionItem[] = []
  try {
    const response = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 1500,
      system: ATTENTION_PROMPT,
      messages: [{ role: 'user', content: signalsText }],
    })

    const textBlock = response.content.find(b => b.type === 'text')
    const text = textBlock && textBlock.type === 'text' ? textBlock.text : ''

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      if (Array.isArray(parsed.items)) {
        const ALLOWED_LABELS = new Set(['Review', 'Open', 'View'])
        const defaultLabelForHref = (href: string): string => {
          if (href.startsWith('/dashboard/coverage')) return 'Review'
          if (href.startsWith('/dashboard/messages')) return 'Open'
          if (href.startsWith('/dashboard/gear')) return 'Review'
          if (href.startsWith('/dashboard/coaches')) return 'Review'
          if (href.startsWith('/dashboard/teams')) return 'Review'
          if (href.startsWith('/dashboard/camps')) return 'Review'
          return 'View'
        }
        items = parsed.items
          .filter((x: any) => x && x.title && x.description && x.urgency && x.signalId && hrefBySignalId.has(x.signalId))
          .map((x: any) => {
            const href = hrefBySignalId.get(x.signalId)!
            const label = ALLOWED_LABELS.has(x.actionLabel) ? x.actionLabel : defaultLabelForHref(href)
            return {
              id: String(x.signalId),
              title: String(x.title).slice(0, 60),
              description: String(x.description).slice(0, 120),
              urgency: ['critical', 'important', 'routine'].includes(x.urgency) ? x.urgency : 'routine',
              actionLabel: label,
              actionHref: href,
            }
          })
          .slice(0, 5)
      }
    }
  } catch (err) {
    console.error('[attention] Claude call failed:', err)
  }

  const result: AttentionResult = {
    items,
    totalSignals,
    generatedAt: now.toISOString(),
  }
  writeCache(cacheKey, result)
  return result
}
