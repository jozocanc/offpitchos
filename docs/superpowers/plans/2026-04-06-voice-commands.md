# Voice Commands Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a microphone button to the Schedule page that lets DOCs and coaches speak commands like "Cancel U14 practice tonight" — the system interprets the intent, executes the action, and confirms.

**Architecture:** Browser Web Speech API captures speech → text sent to Claude with schedule context + tool definitions → Claude returns a tool call (cancelEvent, updateEvent, etc.) → server action executes the mutation → confirmation shown to user. All processing happens in a server action; the client just handles mic input and displays results.

**Tech Stack:** Web Speech API (browser-native), Anthropic SDK (existing), Claude tool use, existing schedule server actions

---

## File Structure

| File | Responsibility |
|------|---------------|
| `app/dashboard/schedule/voice-command.tsx` | Client component — mic button, speech capture, result display |
| `app/dashboard/schedule/voice-actions.ts` | Server action — receives text, calls Claude with tools, executes matched action |
| `app/dashboard/schedule/schedule-client.tsx` | Modify — add VoiceCommand component to header |

---

### Task 1: Voice action server endpoint

**Files:**
- Create: `app-next/app/dashboard/schedule/voice-actions.ts`

- [ ] **Step 1: Create the voice action**

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
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
        // Find event details for confirmation
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
```

- [ ] **Step 2: Commit**

```bash
cd /Users/canci27/Desktop/offpitchos && git add app-next/app/dashboard/schedule/voice-actions.ts
git commit -m "feat: add voice command server action with Claude tool use"
```

---

### Task 2: Voice command client component

**Files:**
- Create: `app-next/app/dashboard/schedule/voice-command.tsx`

- [ ] **Step 1: Create the voice command component**

```tsx
'use client'

import { useState, useRef, useCallback } from 'react'
import { executeVoiceCommand } from './voice-actions'

type VoiceState = 'idle' | 'listening' | 'processing' | 'result'

export default function VoiceCommand() {
  const [state, setState] = useState<VoiceState>('idle')
  const [transcript, setTranscript] = useState('')
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null)
  const recognitionRef = useRef<any>(null)
  const transcriptRef = useRef('')

  const startListening = useCallback(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) {
      setResult({ success: false, message: 'Speech recognition is not supported in this browser.' })
      setState('result')
      return
    }

    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.continuous = false
    recognition.interimResults = true
    recognitionRef.current = recognition

    recognition.onresult = (event: any) => {
      const current = event.results[event.results.length - 1]
      const text = current[0].transcript
      setTranscript(text)
      transcriptRef.current = text
    }

    recognition.onend = async () => {
      const finalTranscript = transcriptRef.current
      if (!finalTranscript.trim()) {
        setState('idle')
        return
      }
      setState('processing')
      try {
        const res = await executeVoiceCommand(finalTranscript)
        setResult(res)
        setState('result')
      } catch {
        setResult({ success: false, message: 'Something went wrong. Try again.' })
        setState('result')
      }
    }

    recognition.onerror = () => {
      setState('idle')
      setResult({ success: false, message: 'Could not hear you. Try again.' })
      setState('result')
    }

    setTranscript('')
    transcriptRef.current = ''
    setResult(null)
    setState('listening')
    recognition.start()
  }, [])

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop()
  }, [])

  const dismiss = useCallback(() => {
    setState('idle')
    setTranscript('')
    setResult(null)
  }, [])

  return (
    <div className="relative">
      {/* Mic button */}
      <button
        onClick={state === 'listening' ? stopListening : startListening}
        disabled={state === 'processing'}
        className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all
          ${state === 'listening'
            ? 'bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse'
            : 'bg-white/5 border border-white/10 text-gray hover:text-white hover:bg-white/10'
          }
          ${state === 'processing' ? 'opacity-50 cursor-not-allowed' : ''}
        `}
        title="Voice command"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
          <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
          <line x1="12" y1="19" x2="12" y2="23" />
          <line x1="8" y1="23" x2="16" y2="23" />
        </svg>
        {state === 'listening' ? 'Listening...' : state === 'processing' ? 'Processing...' : 'Voice'}
      </button>

      {/* Overlay for listening/processing/result */}
      {state !== 'idle' && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-dark-secondary border border-white/10 rounded-xl shadow-2xl z-50 p-4">
          {/* Transcript */}
          {transcript && (
            <div className="mb-3">
              <p className="text-xs text-gray mb-1">You said:</p>
              <p className="text-sm text-white">&ldquo;{transcript}&rdquo;</p>
            </div>
          )}

          {/* Processing indicator */}
          {state === 'processing' && (
            <div className="flex items-center gap-2 text-sm text-gray">
              <span className="inline-block w-1.5 h-1.5 bg-green rounded-full animate-pulse" />
              Ref is processing your command...
            </div>
          )}

          {/* Listening indicator */}
          {state === 'listening' && !transcript && (
            <div className="flex items-center gap-2 text-sm text-gray">
              <span className="inline-block w-2 h-2 bg-red-400 rounded-full animate-pulse" />
              Listening — speak your command...
            </div>
          )}

          {/* Result */}
          {state === 'result' && result && (
            <div>
              <div className={`flex items-start gap-2 text-sm ${result.success ? 'text-green' : 'text-white/80'}`}>
                <span className="mt-0.5">{result.success ? '✓' : '!'}</span>
                <p>{result.message}</p>
              </div>
              <button
                onClick={dismiss}
                className="mt-3 text-xs text-gray hover:text-white transition-colors"
              >
                Dismiss
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/canci27/Desktop/offpitchos && git add app-next/app/dashboard/schedule/voice-command.tsx
git commit -m "feat: add voice command UI with Web Speech API"
```

---

### Task 3: Add VoiceCommand to schedule header

**Files:**
- Modify: `app-next/app/dashboard/schedule/schedule-client.tsx`

- [ ] **Step 1: Read schedule-client.tsx and find the header section**

Look for the header area that contains the title and the "Add Event" button.

- [ ] **Step 2: Import VoiceCommand and add it to the header**

Add import at top:
```typescript
import VoiceCommand from './voice-command'
```

Add `<VoiceCommand />` next to the existing header buttons (near "Add Event" or the view toggle). The component already has a `canEdit` variable defined — use it:
```tsx
{canEdit && <VoiceCommand />}
```

- [ ] **Step 3: Commit**

```bash
cd /Users/canci27/Desktop/offpitchos && git add app-next/app/dashboard/schedule/schedule-client.tsx
git commit -m "feat: add voice command button to schedule header"
```

---

### Task 4: End-to-end test

- [ ] **Step 1: Verify dev server is running**

Navigate to `http://localhost:3000/dashboard/schedule`

- [ ] **Step 2: Verify Voice button appears**

Confirm a "Voice" button with mic icon appears in the schedule header (only for DOC/coach roles).

- [ ] **Step 3: Test voice command — cancel**

Click the Voice button. Say "Cancel U14 practice tonight" (or adjust to match a real event in the schedule). Confirm:
- The transcript appears in the dropdown
- "Ref is processing your command..." shows
- A success message appears: "Done — [event name] has been cancelled..."
- The event in the schedule list now shows as cancelled

- [ ] **Step 4: Test voice command — reschedule**

Click Voice again. Say "Move U12 game to 5 PM" (adjust to match). Confirm the event time updates.

- [ ] **Step 5: Test ambiguous command**

Say something vague like "Cancel practice." Confirm Ref asks for clarification instead of guessing.

- [ ] **Step 6: Test unsupported browser gracefully**

(Optional) Test in a browser without Speech API — confirm the error message appears.

- [ ] **Step 7: Final commit**

```bash
cd /Users/canci27/Desktop/offpitchos && git add -A
git commit -m "feat: voice commands — speak to cancel, reschedule, or move events"
```
