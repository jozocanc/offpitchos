'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Anthropic from '@anthropic-ai/sdk'
import { cancelEvent, updateEvent, createEvent, restoreEvent } from './schedule/actions'
import { createCoverageRequest } from './coverage/actions'
import { createAnnouncement } from './messages/actions'
import { ROLES } from '@/lib/constants'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

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

const tools: Anthropic.Messages.Tool[] = [
  {
    name: 'cancel_event',
    description: 'Cancel a scheduled event (practice, game, etc.). Use when someone says to cancel an event.',
    input_schema: {
      type: 'object' as const,
      properties: {
        eventId: { type: 'string', description: 'The UUID of the event to cancel' },
      },
      required: ['eventId'],
    },
  },
  {
    name: 'update_event_time',
    description: 'Change the date, start time, or end time of an event. Use when someone says to move, reschedule, or change the time of an event.',
    input_schema: {
      type: 'object' as const,
      properties: {
        eventId: { type: 'string', description: 'The UUID of the event to update' },
        newStartTime: { type: 'string', description: 'New start time as ISO 8601 string' },
        newEndTime: { type: 'string', description: 'New end time as ISO 8601 string' },
      },
      required: ['eventId', 'newStartTime', 'newEndTime'],
    },
  },
  {
    name: 'update_event_venue',
    description: 'Change the venue/location of an event. Use when someone says to move an event to a different field or location.',
    input_schema: {
      type: 'object' as const,
      properties: {
        eventId: { type: 'string', description: 'The UUID of the event to update' },
        venueId: { type: 'string', description: 'The UUID of the new venue' },
      },
      required: ['eventId', 'venueId'],
    },
  },
  {
    name: 'create_event',
    description: 'Create a NEW scheduled event (practice, game, tournament, camp, tryout, meeting) for a team. Use when someone says to add, schedule, or create a new event that does not exist yet.',
    input_schema: {
      type: 'object' as const,
      properties: {
        teamId: { type: 'string', description: 'UUID of the team this event is for (match by name or age group from the Teams list)' },
        type: {
          type: 'string',
          enum: ['practice', 'game', 'tournament', 'camp', 'tryout', 'meeting'],
          description: 'The event type',
        },
        title: { type: 'string', description: 'Short human-readable title, e.g. "U14 Boys Practice"' },
        startTime: { type: 'string', description: 'Start time as ISO 8601 WITH the user timezone offset, e.g. "2026-04-12T18:00:00-04:00"' },
        endTime: { type: 'string', description: 'End time as ISO 8601 WITH the user timezone offset. If not specified by the user, default to 90 minutes after startTime.' },
        venueId: { type: 'string', description: 'Optional UUID of the venue. Omit if not specified or if no matching venue exists.' },
        notes: { type: 'string', description: 'Optional notes for the event.' },
      },
      required: ['teamId', 'type', 'title', 'startTime', 'endTime'],
    },
  },
  {
    name: 'request_coverage',
    description: 'The CURRENT USER is saying they cannot attend/coach a specific event and needs someone to cover for them. Use when the user says things like "I can\'t make", "I won\'t be at", "I need coverage for", "I\'m sick and can\'t cover", "please find a replacement for my X practice". Match the event from the Upcoming Events list. The system will automatically try to find and assign a replacement coach.',
    input_schema: {
      type: 'object' as const,
      properties: {
        eventId: { type: 'string', description: 'The UUID of the event the current user cannot attend' },
      },
      required: ['eventId'],
    },
  },
  {
    name: 'send_announcement',
    description: 'Post a new announcement to a specific team or to the entire club. Use when the user says things like "tell U14 parents ...", "send an announcement to ...", "let the team know ...", "message all parents ...", or "post to the club ...". Extract the audience (team name OR club-wide) and the message content from the transcript.',
    input_schema: {
      type: 'object' as const,
      properties: {
        teamId: { type: 'string', description: 'UUID of the team to send to. Omit for a club-wide announcement.' },
        title: { type: 'string', description: 'Short title derived from the user message (max 60 chars). Example: "Indoor practice tonight".' },
        body: { type: 'string', description: 'The full announcement body — what the user wants to tell the audience. Be faithful to the transcript; do not add information.' },
      },
      required: ['title', 'body'],
    },
  },
]

function getTimezoneOffsetString(timeZone: string, atDate: Date): string {
  // Returns offset for `timeZone` at `atDate` as "+HH:MM" or "-HH:MM"
  try {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone,
      timeZoneName: 'longOffset',
      year: 'numeric',
    })
    const parts = dtf.formatToParts(atDate)
    const tzName = parts.find(p => p.type === 'timeZoneName')?.value ?? 'GMT+00:00'
    // tzName is like "GMT-04:00" or "GMT+05:30" or "GMT" (for UTC)
    const match = tzName.match(/GMT([+-])(\d{2}):?(\d{2})?/)
    if (!match) return '+00:00'
    return `${match[1]}${match[2]}:${match[3] ?? '00'}`
  } catch {
    return '+00:00'
  }
}

function buildContext(events: any[], teams: any[], venues: any[], timeZone: string): string {
  const now = new Date()
  const offset = getTimezoneOffsetString(timeZone, now)
  const zonedNow = now.toLocaleString('en-US', {
    timeZone,
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

  let text = `User timezone: ${timeZone} (UTC offset ${offset})\n`
  text += `Current date/time (in user timezone): ${zonedNow}\n\n`

  text += `## Teams\n`
  for (const t of teams) {
    text += `- ${t.name} (${t.age_group}) — ID: ${t.id}\n`
  }

  text += `\n## Venues\n`
  for (const v of venues) {
    text += `- ${v.name} — ID: ${v.id}\n`
  }

  text += `\n## Upcoming Events\n`
  for (const e of events) {
    const dateStr = new Date(e.start_time).toLocaleDateString('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' })
    const timeStr = new Date(e.start_time).toLocaleTimeString('en-US', { timeZone, hour: 'numeric', minute: '2-digit' })
    const endStr = new Date(e.end_time).toLocaleTimeString('en-US', { timeZone, hour: 'numeric', minute: '2-digit' })
    const venue = e.venues?.[0]?.name ?? e.venues?.name ?? 'TBD'
    const team = e.teams?.[0]?.name ?? e.teams?.name ?? 'Club'
    const status = e.status === 'cancelled' ? ' [CANCELLED]' : ''
    text += `- ID: ${e.id} | ${dateStr} ${timeStr}-${endStr} | ${e.title} (${e.type}) | ${team} | at ${venue}${status}\n`
  }

  return text
}

const VOICE_SYSTEM_PROMPT = `You are Ref, the OffPitchOS voice command assistant. A coach or director is giving you a spoken command about their schedule.

Your job:
1. Match the spoken command to the correct event using the schedule data below.
2. Call the appropriate tool to execute the action.
3. If you can't find a matching event or the command is ambiguous, respond with a text message asking for clarification. Do NOT guess.

Rules:
- Match events by team name, event type, date, and time. Use fuzzy matching (e.g. "U14" matches a team with "U14" in its name or age group).
- "Tonight" means today's date. "Tomorrow" means tomorrow. Interpret relative dates from the current date/time.
- When updating time, preserve the event duration unless told otherwise.
- When creating a new event: pick the team from the Teams list (fuzzy-match the name/age group). If no end time is specified, default to 90 minutes after start. Build a sensible title like "U14 Boys Practice" if none was provided. Use the venue from the Venues list if the user named one; otherwise omit venueId.
- When the user says they themselves cannot make an event ("I can't make", "I'm sick", "I can't cover my U14 practice tonight", "need a replacement for my practice"), call request_coverage with the matching eventId. This will trigger the coverage flow and auto-assign a replacement. Do NOT cancel the event — coverage is different from cancellation.
- When the user wants to send a message to a team or the whole club ("tell U14 parents ...", "send an announcement to ...", "let the team know ...", "message all parents ..."), call send_announcement. Match the team fuzzy (e.g. "U14 parents" → U14 Boys team). If the user says "all teams", "the whole club", "everyone", or does not name a team, omit teamId for a club-wide post. Build a short sensible title from the message.
- Only use tools when you're confident about the match. If multiple options could match, ask which one.
- When you successfully execute a tool, respond with a short confirmation message describing what you did.

CRITICAL — Timezone handling:
- All times in the schedule data below are shown in the USER'S LOCAL TIMEZONE.
- When calling update_event_time, ALWAYS include the user's UTC offset in the ISO 8601 string.
- Example: if the user's offset is -04:00 and they want 3:00 PM on April 10, return "2026-04-10T15:00:00-04:00" — NOT "2026-04-10T15:00:00" and NOT "2026-04-10T15:00:00Z".
- The user's current offset is given in the context below. Use it verbatim.`

export interface VoiceCommandResult {
  success: boolean
  message: string
  undoEventId?: string
}

export async function undoCancelEvent(eventId: string): Promise<VoiceCommandResult> {
  try {
    const counts = await restoreEvent(eventId)
    const total = counts.parents + counts.coaches
    return {
      success: true,
      message: total > 0
        ? `Restored. Notified ${total} ${total === 1 ? 'person' : 'people'} the event is back on.`
        : 'Restored.',
    }
  } catch (err: any) {
    return { success: false, message: `Could not restore: ${err?.message ?? 'unknown error'}` }
  }
}

export async function executeVoiceCommand(transcript: string, timeZone: string = 'UTC'): Promise<VoiceCommandResult> {
  if (!transcript.trim()) return { success: false, message: 'No command received.' }

  const { profile, supabase } = await getUserProfile()

  if (profile.role === ROLES.PARENT) {
    return { success: false, message: 'Voice commands are only available for directors and coaches.' }
  }

  // Get schedule context
  const now = new Date()
  const twoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)

  const [eventsRes, teamsRes, venuesRes] = await Promise.all([
    supabase
      .from('events')
      .select('id, title, type, start_time, end_time, status, teams(id, name, age_group), venues(id, name)')
      .eq('club_id', profile.club_id)
      .gte('start_time', now.toISOString())
      .lte('start_time', twoWeeks.toISOString())
      .order('start_time', { ascending: true })
      .limit(50),
    supabase.from('teams').select('id, name, age_group').eq('club_id', profile.club_id),
    supabase.from('venues').select('id, name').eq('club_id', profile.club_id),
  ])

  const events = eventsRes.data ?? []
  const teams = teamsRes.data ?? []
  const venues = venuesRes.data ?? []

  const context = buildContext(events, teams, venues, timeZone)

  // Call Claude with tools
  const response = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    system: VOICE_SYSTEM_PROMPT + '\n\n---\n\n' + context,
    tools,
    messages: [{ role: 'user', content: transcript }],
  })

  // Check if Claude wants to use a tool
  const toolUse = response.content.find(block => block.type === 'tool_use')

  if (!toolUse || toolUse.type !== 'tool_use') {
    // Claude responded with text (clarification or error)
    const textBlock = response.content.find(block => block.type === 'text')
    const message = textBlock && textBlock.type === 'text' ? textBlock.text : 'I didn\'t understand that command. Try something like "Cancel U14 practice tonight".'
    return { success: false, message }
  }

  const input = toolUse.input as Record<string, any>

  // Safety net: if Claude forgot the offset, append the user's offset to naive ISO strings
  const naiveIsoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/
  const userOffset = getTimezoneOffsetString(timeZone, now)
  const ensureOffset = (iso: string | undefined): string | undefined => {
    if (!iso) return iso
    if (naiveIsoRegex.test(iso)) return iso + userOffset
    return iso
  }
  if (typeof input.newStartTime === 'string') input.newStartTime = ensureOffset(input.newStartTime)
  if (typeof input.newEndTime === 'string') input.newEndTime = ensureOffset(input.newEndTime)
  if (typeof input.startTime === 'string') input.startTime = ensureOffset(input.startTime)
  if (typeof input.endTime === 'string') input.endTime = ensureOffset(input.endTime)

  const formatNotified = (parents: number, coaches: number): string => {
    if (parents === 0 && coaches === 0) return 'No one needed to be notified.'
    const parts: string[] = []
    if (parents > 0) parts.push(`${parents} ${parents === 1 ? 'parent' : 'parents'}`)
    if (coaches > 0) parts.push(`${coaches} ${coaches === 1 ? 'coach' : 'coaches'}`)
    return `Notified ${parts.join(' and ')}.`
  }

  try {
    switch (toolUse.name) {
      case 'cancel_event': {
        const counts = await cancelEvent(input.eventId)
        const event = events.find(e => e.id === input.eventId)
        const name = event?.title ?? 'Event'
        return {
          success: true,
          message: `Done — "${name}" cancelled. ${formatNotified(counts.parents, counts.coaches)}`,
          undoEventId: input.eventId,
        }
      }

      case 'update_event_time': {
        const event = events.find(e => e.id === input.eventId)
        if (!event) return { success: false, message: 'Could not find that event.' }

        const counts = await updateEvent({
          eventId: input.eventId,
          title: event.title,
          startTime: input.newStartTime,
          endTime: input.newEndTime,
          venueId: (event.venues as any)?.[0]?.id ?? null,
          notes: null,
          updateFuture: false,
        })
        const newStart = new Date(input.newStartTime)
        const timeStr = newStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        const dateStr = newStart.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
        return { success: true, message: `Done — "${event.title}" moved to ${dateStr} at ${timeStr}. ${formatNotified(counts.parents, counts.coaches)}` }
      }

      case 'update_event_venue': {
        const event = events.find(e => e.id === input.eventId)
        if (!event) return { success: false, message: 'Could not find that event.' }

        const counts = await updateEvent({
          eventId: input.eventId,
          title: event.title,
          startTime: event.start_time,
          endTime: event.end_time,
          venueId: input.venueId,
          notes: null,
          updateFuture: false,
        })
        const venue = venues.find(v => v.id === input.venueId)
        return { success: true, message: `Done — "${event.title}" moved to ${venue?.name ?? 'new venue'}. ${formatNotified(counts.parents, counts.coaches)}` }
      }

      case 'send_announcement': {
        const result = await createAnnouncement({
          teamId: input.teamId ?? null,
          title: String(input.title ?? '').slice(0, 120),
          body: String(input.body ?? ''),
        })
        const parts: string[] = []
        if (result.parentCount > 0) parts.push(`${result.parentCount} ${result.parentCount === 1 ? 'parent' : 'parents'}`)
        if (result.coachCount > 0) parts.push(`${result.coachCount} ${result.coachCount === 1 ? 'coach' : 'coaches'}`)
        const audienceSuffix = parts.length > 0 ? ` Sent to ${parts.join(' and ')}.` : ''
        return {
          success: true,
          message: `Posted to ${result.audienceLabel}.${audienceSuffix}`,
        }
      }

      case 'request_coverage': {
        const event = events.find(e => e.id === input.eventId)
        if (!event) return { success: false, message: 'Could not find that event.' }

        const result = await createCoverageRequest(input.eventId, profile.id)
        if (result.autoAssigned && result.coveringCoachName) {
          const reasonTail = result.reason ? ` (${result.reason.toLowerCase()})` : ''
          return {
            success: true,
            message: `Done — ${result.coveringCoachName} is covering "${result.eventTitle}" for you${reasonTail}. Parents notified.`,
          }
        }
        return {
          success: true,
          message: `Sent coverage request for "${result.eventTitle}" to the other coaches. You'll get a notification when someone accepts.`,
        }
      }

      case 'create_event': {
        // Validate the team exists in this club
        const team = teams.find(t => t.id === input.teamId)
        if (!team) return { success: false, message: 'Could not find that team.' }

        await createEvent({
          teamId: input.teamId,
          type: input.type,
          title: String(input.title ?? `${team.name} ${input.type}`).slice(0, 120),
          startTime: input.startTime,
          endTime: input.endTime,
          venueId: input.venueId ?? null,
          notes: input.notes ?? null,
          recurring: { enabled: false, days: [], endDate: '' },
        })

        const start = new Date(input.startTime)
        const timeStr = start.toLocaleTimeString('en-US', { timeZone, hour: 'numeric', minute: '2-digit' })
        const dateStr = start.toLocaleDateString('en-US', { timeZone, weekday: 'short', month: 'short', day: 'numeric' })
        const venueName = input.venueId ? venues.find(v => v.id === input.venueId)?.name : null
        const venuePart = venueName ? ` at ${venueName}` : ''
        return { success: true, message: `Added — ${team.name} ${input.type} on ${dateStr} at ${timeStr}${venuePart}. Parents will be notified.` }
      }

      default:
        return { success: false, message: 'Unknown command.' }
    }
  } catch (err: any) {
    return { success: false, message: `Failed to execute: ${err.message}` }
  }
}
