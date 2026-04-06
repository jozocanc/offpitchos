'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Anthropic from '@anthropic-ai/sdk'
import { cancelEvent, updateEvent } from './actions'
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
]

function buildContext(events: any[], teams: any[], venues: any[]): string {
  const now = new Date()
  let text = `Current date/time: ${now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })} ${now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}\n\n`

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
    const start = new Date(e.start_time)
    const end = new Date(e.end_time)
    const dateStr = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    const timeStr = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    const endStr = end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    const venue = e.venues?.name ?? 'TBD'
    const team = e.teams?.name ?? 'Club'
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
- Only use tools when you're confident about the match. If multiple events could match, ask which one.
- When you successfully execute a tool, respond with a short confirmation message describing what you did.`

export async function executeVoiceCommand(transcript: string): Promise<{ success: boolean; message: string }> {
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

  const context = buildContext(events, teams, venues)

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

  try {
    switch (toolUse.name) {
      case 'cancel_event': {
        await cancelEvent(input.eventId)
        const event = events.find(e => e.id === input.eventId)
        const name = event?.title ?? 'Event'
        return { success: true, message: `Done — "${name}" has been cancelled and everyone has been notified.` }
      }

      case 'update_event_time': {
        const event = events.find(e => e.id === input.eventId)
        if (!event) return { success: false, message: 'Could not find that event.' }

        await updateEvent({
          eventId: input.eventId,
          title: event.title,
          startTime: input.newStartTime,
          endTime: input.newEndTime,
          venueId: event.venues?.id ?? null,
          notes: null,
          updateFuture: false,
        })
        const newStart = new Date(input.newStartTime)
        const timeStr = newStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
        const dateStr = newStart.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
        return { success: true, message: `Done — "${event.title}" moved to ${dateStr} at ${timeStr}. Everyone has been notified.` }
      }

      case 'update_event_venue': {
        const event = events.find(e => e.id === input.eventId)
        if (!event) return { success: false, message: 'Could not find that event.' }

        await updateEvent({
          eventId: input.eventId,
          title: event.title,
          startTime: event.start_time,
          endTime: event.end_time,
          venueId: input.venueId,
          notes: null,
          updateFuture: false,
        })
        const venue = venues.find(v => v.id === input.venueId)
        return { success: true, message: `Done — "${event.title}" moved to ${venue?.name ?? 'new venue'}. Everyone has been notified.` }
      }

      default:
        return { success: false, message: 'Unknown command.' }
    }
  } catch (err: any) {
    return { success: false, message: `Failed to execute: ${err.message}` }
  }
}
