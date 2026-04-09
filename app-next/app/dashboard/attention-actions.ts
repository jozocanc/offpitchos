'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

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
- Use "critical" only for time pressure (coverage expiring, event in <2h without coverage).
- Use "important" for this-week items (pending replies, new parent replies, upcoming games).
- Use "routine" for awareness (upcoming events going smoothly).

ACTION LABELS:
- Clicking a card ONLY navigates the user to the relevant page. The card itself does NOT take the action.
- Use ONLY these labels (pick the most appropriate one):
  - "Review" — for coverage requests (user goes to review and resolve them)
  - "Open" — for parent replies on announcements (user goes to read and respond)
  - "View" — for upcoming events (user goes to the schedule to see them)
- Do NOT use labels like "Confirm", "Assign", "Cancel", "Reply", "Send", "Approve" — these imply the card itself does the action, which is wrong.

Return JSON only, no preamble, no markdown. Match this exact schema:
{
  "items": [
    {
      "signalId": "coverage-<uuid> | event-<uuid> | reply-<uuid>",
      "title": "Short title (max 5 words)",
      "description": "One sentence under 80 chars",
      "urgency": "critical",
      "actionLabel": "Review"
    }
  ]
}`

export async function getAttentionList(timeZone: string = 'UTC'): Promise<AttentionResult> {
  const { profile, supabase } = await getUserProfile()

  // Only DOCs get the triaged attention list
  if (profile.role !== 'doc') {
    return { items: [], totalSignals: 0, generatedAt: new Date().toISOString() }
  }

  const now = new Date()
  const in48h = new Date(now.getTime() + 48 * 60 * 60 * 1000)
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)

  // Gather signals in parallel
  const [coverageRes, upcomingRes, repliesRes] = await Promise.all([
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
  ])

  const coverage = coverageRes.data ?? []
  const upcoming = upcomingRes.data ?? []
  const replies = repliesRes.data ?? []

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

  if (signalParts.length === 1) {
    // Only the header — no signals at all
    return {
      items: [],
      totalSignals: 0,
      generatedAt: now.toISOString(),
    }
  }

  const signalsText = signalParts.join('\n')
  const totalSignals = coverage.length + upcoming.length + replies.length

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

  return {
    items,
    totalSignals,
    generatedAt: now.toISOString(),
  }
}
