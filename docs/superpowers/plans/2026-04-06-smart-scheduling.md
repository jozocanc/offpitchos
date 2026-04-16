# Smart Scheduling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add conflict detection and auto-suggestions to event creation — warn about venue double-bookings, team schedule overlaps, and coach conflicts, then suggest available alternatives.

**Architecture:** A new server action `checkConflicts` queries the events table for time overlaps (venue, team, coach). The event modal calls this on form change (debounced) and displays warnings inline. When conflicts are found, a `suggestAlternatives` action finds the next available slots. All checks also run server-side in `createEvent` before insert.

**Tech Stack:** Supabase (existing), Next.js server actions, React client component modifications

---

## File Structure

| File | Responsibility |
|------|---------------|
| `app/dashboard/schedule/conflict-actions.ts` | Server actions — conflict checking + alternative suggestions |
| `app/dashboard/schedule/conflict-banner.tsx` | Client component — displays conflict warnings and suggestions |
| `app/dashboard/schedule/event-modal.tsx` | Modify — integrate conflict checking into form |
| `app/dashboard/schedule/actions.ts` | Modify — add server-side conflict validation in createEvent |

---

### Task 1: Conflict detection server actions

**Files:**
- Create: `app-next/app/dashboard/schedule/conflict-actions.ts`

- [ ] **Step 1: Create the conflict actions**

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

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
  return { profile, supabase }
}

export interface Conflict {
  type: 'venue' | 'team' | 'coach'
  message: string
  eventTitle: string
  eventTime: string
}

export interface Suggestion {
  startTime: string
  endTime: string
  label: string
}

export async function checkConflicts(input: {
  teamId: string
  startTime: string
  endTime: string
  venueId: string | null
  excludeEventId?: string
}): Promise<Conflict[]> {
  const { profile, supabase } = await getUserProfile()
  const conflicts: Conflict[] = []

  const { teamId, startTime, endTime, venueId, excludeEventId } = input

  // 1. Check team schedule overlap
  let teamQuery = supabase
    .from('events')
    .select('id, title, start_time, end_time')
    .eq('club_id', profile.club_id)
    .eq('team_id', teamId)
    .eq('status', 'scheduled')
    .lt('start_time', endTime)
    .gt('end_time', startTime)

  if (excludeEventId) {
    teamQuery = teamQuery.neq('id', excludeEventId)
  }

  const { data: teamConflicts } = await teamQuery

  for (const e of teamConflicts ?? []) {
    const start = new Date(e.start_time)
    conflicts.push({
      type: 'team',
      message: 'This team already has an event at this time',
      eventTitle: e.title,
      eventTime: start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    })
  }

  // 2. Check venue double-booking
  if (venueId) {
    let venueQuery = supabase
      .from('events')
      .select('id, title, start_time, end_time, teams(name)')
      .eq('club_id', profile.club_id)
      .eq('venue_id', venueId)
      .eq('status', 'scheduled')
      .lt('start_time', endTime)
      .gt('end_time', startTime)

    if (excludeEventId) {
      venueQuery = venueQuery.neq('id', excludeEventId)
    }

    const { data: venueConflicts } = await venueQuery

    for (const e of venueConflicts ?? []) {
      // Skip if same team (already caught above)
      if (teamConflicts?.some(tc => tc.id === e.id)) continue
      const start = new Date(e.start_time)
      const teamName = (e.teams as any)?.name ?? 'Another team'
      conflicts.push({
        type: 'venue',
        message: `This venue is booked by ${teamName}`,
        eventTitle: e.title,
        eventTime: start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      })
    }
  }

  // 3. Check coach conflicts (coaches assigned to multiple teams)
  const { data: coaches } = await supabase
    .from('team_members')
    .select('profile_id')
    .eq('team_id', teamId)
    .eq('role', 'coach')

  if (coaches && coaches.length > 0) {
    const coachIds = coaches.map(c => c.profile_id)

    // Find other teams these coaches are on
    const { data: otherTeams } = await supabase
      .from('team_members')
      .select('team_id, profile_id, profiles(display_name)')
      .in('profile_id', coachIds)
      .eq('role', 'coach')
      .neq('team_id', teamId)

    if (otherTeams && otherTeams.length > 0) {
      const otherTeamIds = [...new Set(otherTeams.map(t => t.team_id))]

      let coachQuery = supabase
        .from('events')
        .select('id, title, start_time, end_time, team_id, teams(name)')
        .eq('club_id', profile.club_id)
        .in('team_id', otherTeamIds)
        .eq('status', 'scheduled')
        .lt('start_time', endTime)
        .gt('end_time', startTime)

      if (excludeEventId) {
        coachQuery = coachQuery.neq('id', excludeEventId)
      }

      const { data: coachConflicts } = await coachQuery

      for (const e of coachConflicts ?? []) {
        const overlappingCoaches = otherTeams
          .filter(t => t.team_id === e.team_id)
          .map(t => (t.profiles as any)?.display_name ?? 'A coach')

        const start = new Date(e.start_time)
        const teamName = (e.teams as any)?.name ?? 'another team'
        conflicts.push({
          type: 'coach',
          message: `${overlappingCoaches.join(', ')} also coaches ${teamName} at this time`,
          eventTitle: e.title,
          eventTime: start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
        })
      }
    }
  }

  return conflicts
}

export async function suggestAlternatives(input: {
  teamId: string
  venueId: string | null
  date: string
  durationMinutes: number
}): Promise<Suggestion[]> {
  const { profile, supabase } = await getUserProfile()

  const { teamId, venueId, date, durationMinutes } = input
  const suggestions: Suggestion[] = []

  // Get all events on this date for this team and venue
  const dayStart = new Date(`${date}T00:00:00`)
  const dayEnd = new Date(`${date}T23:59:59`)

  const { data: dayEvents } = await supabase
    .from('events')
    .select('start_time, end_time, team_id, venue_id')
    .eq('club_id', profile.club_id)
    .eq('status', 'scheduled')
    .gte('start_time', dayStart.toISOString())
    .lte('start_time', dayEnd.toISOString())
    .order('start_time', { ascending: true })

  const events = dayEvents ?? []

  // Try slots from 7 AM to 9 PM in 30-min increments
  for (let hour = 7; hour <= 21; hour++) {
    for (const min of [0, 30]) {
      const slotStart = new Date(`${date}T${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}:00`)
      const slotEnd = new Date(slotStart.getTime() + durationMinutes * 60 * 1000)

      // Don't suggest slots past 10 PM
      if (slotEnd.getHours() >= 22) continue

      // Check if slot conflicts with team schedule
      const teamConflict = events.some(e =>
        e.team_id === teamId &&
        new Date(e.start_time) < slotEnd &&
        new Date(e.end_time) > slotStart
      )
      if (teamConflict) continue

      // Check if slot conflicts with venue
      if (venueId) {
        const venueConflict = events.some(e =>
          e.venue_id === venueId &&
          new Date(e.start_time) < slotEnd &&
          new Date(e.end_time) > slotStart
        )
        if (venueConflict) continue
      }

      const label = slotStart.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) +
        ' – ' + slotEnd.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })

      suggestions.push({
        startTime: slotStart.toISOString(),
        endTime: slotEnd.toISOString(),
        label,
      })

      if (suggestions.length >= 5) return suggestions
    }
  }

  return suggestions
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/canci27/Desktop/offpitchos && git add app-next/app/dashboard/schedule/conflict-actions.ts
git commit -m "feat: add conflict detection and auto-suggest server actions"
```

---

### Task 2: Conflict banner component

**Files:**
- Create: `app-next/app/dashboard/schedule/conflict-banner.tsx`

- [ ] **Step 1: Create the conflict banner**

```tsx
'use client'

import type { Conflict, Suggestion } from './conflict-actions'

interface ConflictBannerProps {
  conflicts: Conflict[]
  suggestions: Suggestion[]
  onSelectSuggestion: (startTime: string, endTime: string) => void
  loading: boolean
}

export default function ConflictBanner({ conflicts, suggestions, onSelectSuggestion, loading }: ConflictBannerProps) {
  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray px-3 py-2">
        <span className="inline-block w-1.5 h-1.5 bg-green rounded-full animate-pulse" />
        Checking for conflicts...
      </div>
    )
  }

  if (conflicts.length === 0) return null

  const iconMap = {
    team: '📋',
    venue: '📍',
    coach: '👤',
  }

  return (
    <div className="rounded-lg border border-yellow-500/30 bg-yellow-500/5 p-3 space-y-2">
      <p className="text-xs font-semibold text-yellow-400 uppercase tracking-wide">Conflicts detected</p>

      {conflicts.map((c, i) => (
        <div key={i} className="flex items-start gap-2 text-sm">
          <span className="mt-0.5">{iconMap[c.type]}</span>
          <div>
            <p className="text-white/80">{c.message}</p>
            <p className="text-xs text-gray">{c.eventTitle} at {c.eventTime}</p>
          </div>
        </div>
      ))}

      {suggestions.length > 0 && (
        <div className="pt-2 border-t border-white/5">
          <p className="text-xs text-gray mb-2">Available slots:</p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() => onSelectSuggestion(s.startTime, s.endTime)}
                className="px-2.5 py-1 rounded-md bg-green/10 border border-green/20 text-xs text-green hover:bg-green/20 transition-colors"
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/canci27/Desktop/offpitchos && git add app-next/app/dashboard/schedule/conflict-banner.tsx
git commit -m "feat: add conflict warning banner with suggestion chips"
```

---

### Task 3: Integrate conflict checking into event modal

**Files:**
- Modify: `app-next/app/dashboard/schedule/event-modal.tsx`

- [ ] **Step 1: Read event-modal.tsx fully**

Understand the current form state, submit handler, and layout.

- [ ] **Step 2: Add imports and conflict state**

At the top, add:
```typescript
import { checkConflicts, suggestAlternatives } from './conflict-actions'
import type { Conflict, Suggestion } from './conflict-actions'
import ConflictBanner from './conflict-banner'
```

Add state variables inside the component:
```typescript
const [conflicts, setConflicts] = useState<Conflict[]>([])
const [suggestions, setSuggestions] = useState<Suggestion[]>([])
const [checkingConflicts, setCheckingConflicts] = useState(false)
```

- [ ] **Step 3: Add a conflict check effect**

Add a `useEffect` that runs conflict checks when team, date, startTime, endTime, or venue changes (debounced with a timeout):

```typescript
useEffect(() => {
  // Only check when we have enough data
  if (!teamId || !date || !startTime || !endTime) {
    setConflicts([])
    setSuggestions([])
    return
  }

  const timeout = setTimeout(async () => {
    setCheckingConflicts(true)
    try {
      const startISO = new Date(`${date}T${startTime}`).toISOString()
      const endISO = new Date(`${date}T${endTime}`).toISOString()

      const found = await checkConflicts({
        teamId,
        startTime: startISO,
        endTime: endISO,
        venueId: venueId || null,
        excludeEventId: editEvent?.id,
      })
      setConflicts(found)

      if (found.length > 0) {
        const startDate = new Date(`${date}T${startTime}`)
        const endDate = new Date(`${date}T${endTime}`)
        const durationMinutes = (endDate.getTime() - startDate.getTime()) / 60000

        const alts = await suggestAlternatives({
          teamId,
          venueId: venueId || null,
          date,
          durationMinutes,
        })
        setSuggestions(alts)
      } else {
        setSuggestions([])
      }
    } catch {
      // Silently fail — conflicts are advisory
    } finally {
      setCheckingConflicts(false)
    }
  }, 500)

  return () => clearTimeout(timeout)
}, [teamId, date, startTime, endTime, venueId, editEvent?.id])
```

Note: `editEvent` should be available from the component's props or state. The variable names `teamId`, `date`, `startTime`, `endTime`, `venueId` should match the existing form state variable names in the component.

- [ ] **Step 4: Add suggestion handler**

```typescript
function handleSelectSuggestion(startISO: string, endISO: string) {
  const start = new Date(startISO)
  const end = new Date(endISO)
  setStartTime(start.toTimeString().slice(0, 5))
  setEndTime(end.toTimeString().slice(0, 5))
}
```

- [ ] **Step 5: Add ConflictBanner to the form JSX**

Place it after the venue select and before the notes textarea:

```tsx
<ConflictBanner
  conflicts={conflicts}
  suggestions={suggestions}
  onSelectSuggestion={handleSelectSuggestion}
  loading={checkingConflicts}
/>
```

- [ ] **Step 6: Commit**

```bash
cd /Users/canci27/Desktop/offpitchos && git add app-next/app/dashboard/schedule/event-modal.tsx
git commit -m "feat: integrate conflict detection into event creation modal"
```

---

### Task 4: Server-side conflict validation in createEvent

**Files:**
- Modify: `app-next/app/dashboard/schedule/actions.ts`

- [ ] **Step 1: Read actions.ts and find the createEvent function**

- [ ] **Step 2: Add conflict check before insert**

Import the conflict checker at the top of the file:
```typescript
import { checkConflicts } from './conflict-actions'
```

In `createEvent`, after validation but before the insert query, add (only for non-recurring events — recurring events have too many occurrences to check individually in v1):

```typescript
// Check for team conflicts on single events (recurring relies on UI-side warnings)
if (!input.recurring?.enabled) {
  const conflicts = await checkConflicts({
    teamId: input.teamId,
    startTime: input.startTime,
    endTime: input.endTime,
    venueId: input.venueId,
  })

  if (conflicts.some(c => c.type === 'team')) {
    throw new Error('This team already has an event at this time. Please choose a different time.')
  }
}
```

This blocks team double-bookings (hard conflict) but allows venue and coach conflicts (soft — already warned in UI).

- [ ] **Step 3: Commit**

```bash
cd /Users/canci27/Desktop/offpitchos && git add app-next/app/dashboard/schedule/actions.ts
git commit -m "feat: add server-side team conflict validation in createEvent"
```

---

### Task 5: End-to-end test

- [ ] **Step 1: Verify dev server is running**

Navigate to `http://localhost:3000/dashboard/schedule`

- [ ] **Step 2: Test conflict detection — team overlap**

Create an event for a team at a specific time. Then try to create another event for the same team at the same time. Confirm:
- Yellow conflict banner appears with "This team already has an event at this time"
- Alternative time suggestions appear below
- Server blocks the creation with an error

- [ ] **Step 3: Test conflict detection — venue double-booking**

Create an event at a venue. Then create an event for a different team at the same venue and time. Confirm:
- Yellow banner shows venue conflict warning
- Event can still be created (soft warning)

- [ ] **Step 4: Test auto-suggestions**

When conflicts are detected, confirm suggestion chips show available time slots. Click a suggestion — confirm the start/end time fields update.

- [ ] **Step 5: Test no conflicts**

Create an event at a time with no overlaps. Confirm no warnings appear.

- [ ] **Step 6: Test editing existing events**

Edit an existing event — confirm it doesn't flag itself as a conflict.

- [ ] **Step 7: Final commit**

```bash
cd /Users/canci27/Desktop/offpitchos && git add -A
git commit -m "feat: smart scheduling — conflict detection and auto-suggestions"
```
