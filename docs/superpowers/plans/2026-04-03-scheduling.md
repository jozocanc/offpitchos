# Scheduling Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add event scheduling (practices, games, tournaments, etc.), saved venues, and in-app notifications to OffPitchOS.

**Architecture:** Event-based with smart recurrence — recurring patterns expand into individual event rows sharing a `recurrence_group` UUID. Notifications are created server-side in actions.ts using the service role client. Agenda view (default) and weekly calendar view with toggle.

**Tech Stack:** Next.js 14, Supabase (Postgres + RLS), Tailwind CSS 4, TypeScript. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-04-03-scheduling-design.md`

**Note:** This project has no test framework configured (no Jest, Vitest, or Playwright in package.json). Steps focus on manual verification via the dev server and build checks.

---

## File Structure

```
# New files
supabase/migrations/006_scheduling.sql              — schema, indexes, triggers, RLS
app-next/lib/constants.ts                            — add EVENT_TYPES, EVENT_STATUSES
app-next/lib/supabase/service.ts                     — service role client for notifications
app-next/app/dashboard/schedule/page.tsx             — main schedule page (server component)
app-next/app/dashboard/schedule/actions.ts           — server actions (CRUD events, recurring, notifications)
app-next/app/dashboard/schedule/agenda-view.tsx      — agenda list view (client component)
app-next/app/dashboard/schedule/calendar-view.tsx    — weekly calendar grid (client component)
app-next/app/dashboard/schedule/event-card.tsx       — single event card (client component)
app-next/app/dashboard/schedule/event-modal.tsx      — add/edit event modal (client component)
app-next/app/dashboard/schedule/filters.tsx          — team/type filter controls (client component)
app-next/app/dashboard/settings/venues-section.tsx   — venue CRUD section (client component)
app-next/app/dashboard/settings/venue-actions.ts     — server actions for venue CRUD
app-next/components/notification-bell.tsx             — bell icon + dropdown (client component)

# Modified files
app-next/app/dashboard/settings/page.tsx             — import and render VenuesSection
app-next/components/sidebar.tsx                      — add NotificationBell, enable Schedule link
app-next/app/dashboard/page.tsx                      — wire up "Today's Sessions" stat card
app-next/app/dashboard/layout.tsx                    — pass profile data for notification bell
```

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/006_scheduling.sql`

This is the foundation — all tables, constraints, indexes, triggers, and RLS policies.

- [ ] **Step 1: Create the migration file**

```sql
-- ============================================================
-- 006_scheduling.sql — venues, events, notifications
-- ============================================================

-- --------------------------------------------------------
-- TABLES
-- --------------------------------------------------------

CREATE TABLE venues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  name text NOT NULL,
  address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('practice', 'game', 'tournament', 'camp', 'tryout', 'meeting', 'custom')),
  title text NOT NULL,
  start_time timestamptz NOT NULL,
  end_time timestamptz NOT NULL,
  venue_id uuid REFERENCES venues(id) ON DELETE SET NULL,
  recurrence_group uuid,
  notes text,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'cancelled')),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT events_end_after_start CHECK (end_time > start_time)
);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('event_created', 'event_updated', 'event_cancelled')),
  message text NOT NULL,
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- --------------------------------------------------------
-- INDEXES
-- --------------------------------------------------------

CREATE INDEX idx_venues_club_id ON venues(club_id);

CREATE INDEX idx_events_club_id ON events(club_id);
CREATE INDEX idx_events_team_start ON events(team_id, start_time);
CREATE INDEX idx_events_start_time ON events(start_time);
CREATE INDEX idx_events_recurrence_group ON events(recurrence_group) WHERE recurrence_group IS NOT NULL;
CREATE INDEX idx_events_status ON events(status);

CREATE INDEX idx_notifications_profile_id ON notifications(profile_id);
CREATE INDEX idx_notifications_unread ON notifications(profile_id, read) WHERE read = false;
CREATE INDEX idx_notifications_event_id ON notifications(event_id);

-- --------------------------------------------------------
-- TRIGGERS
-- --------------------------------------------------------

CREATE TRIGGER events_updated_at
  BEFORE UPDATE ON events
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- --------------------------------------------------------
-- RLS
-- --------------------------------------------------------

ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- venues: DOC full CRUD
CREATE POLICY venues_doc_all ON venues FOR ALL
  USING (club_id IN (SELECT get_doc_club_ids()))
  WITH CHECK (club_id IN (SELECT get_doc_club_ids()));

-- venues: all club members read
CREATE POLICY venues_member_read ON venues FOR SELECT
  USING (club_id IN (SELECT get_user_club_ids()));

-- events: DOC full CRUD for their club
CREATE POLICY events_doc_all ON events FOR ALL
  USING (club_id IN (SELECT get_doc_club_ids()))
  WITH CHECK (club_id IN (SELECT get_doc_club_ids()));

-- events: coach CRUD for their teams (non-DOC only)
CREATE POLICY events_coach_all ON events FOR ALL
  USING (
    team_id IN (SELECT get_user_team_ids())
    AND club_id NOT IN (SELECT get_doc_club_ids())
  )
  WITH CHECK (
    team_id IN (SELECT get_user_team_ids())
    AND club_id NOT IN (SELECT get_doc_club_ids())
  );

-- events: all team members can read their team's events
CREATE POLICY events_member_read ON events FOR SELECT
  USING (team_id IN (SELECT get_user_team_ids()));

-- notifications: users read their own
CREATE POLICY notifications_own_read ON notifications FOR SELECT
  USING (profile_id IN (SELECT get_user_profile_ids()));

-- notifications: users update their own (mark read)
CREATE POLICY notifications_own_update ON notifications FOR UPDATE
  USING (profile_id IN (SELECT get_user_profile_ids()))
  WITH CHECK (profile_id IN (SELECT get_user_profile_ids()));

-- notifications: insert via service role only (no user INSERT policy)
```

- [ ] **Step 2: Apply the migration to Supabase**

Run this SQL in the Supabase SQL Editor (Dashboard → SQL Editor → paste and run). Verify no errors.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/006_scheduling.sql
git commit -m "feat: add scheduling schema — venues, events, notifications with RLS"
```

---

## Task 2: Constants and Service Role Client

**Files:**
- Modify: `app-next/lib/constants.ts`
- Create: `app-next/lib/supabase/service.ts`

- [ ] **Step 1: Add event constants to constants.ts**

Add after the existing `AGE_GROUPS` block:

```typescript
export const EVENT_TYPES = [
  'practice', 'game', 'tournament', 'camp', 'tryout', 'meeting', 'custom',
] as const

export type EventType = (typeof EVENT_TYPES)[number]

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  practice: 'Practice',
  game: 'Game',
  tournament: 'Tournament',
  camp: 'Camp',
  tryout: 'Tryout',
  meeting: 'Meeting',
  custom: 'Custom',
}

export const EVENT_STATUSES = ['scheduled', 'cancelled'] as const
export type EventStatus = (typeof EVENT_STATUSES)[number]

export const DAYS_OF_WEEK = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
] as const
```

- [ ] **Step 2: Create service role client**

Create `app-next/lib/supabase/service.ts`:

```typescript
import { createClient } from '@supabase/supabase-js'

export function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}
```

This client bypasses RLS — used only server-side for inserting notifications.

- [ ] **Step 3: Add SUPABASE_SERVICE_ROLE_KEY to .env.local.example**

Add this line:

```
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
```

- [ ] **Step 4: Verify build**

```bash
cd app-next && npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 5: Commit**

```bash
git add app-next/lib/constants.ts app-next/lib/supabase/service.ts app-next/.env.local.example
git commit -m "feat: add event constants and service role client for notifications"
```

---

## Task 3: Venue Management (Settings Section)

**Files:**
- Create: `app-next/app/dashboard/settings/venue-actions.ts`
- Create: `app-next/app/dashboard/settings/venues-section.tsx`
- Modify: `app-next/app/dashboard/settings/page.tsx`

- [ ] **Step 1: Create venue server actions**

Create `app-next/app/dashboard/settings/venue-actions.ts`:

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

export async function getVenues() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id')
    .eq('user_id', user.id)
    .single()

  if (!profile?.club_id) return []

  const { data } = await supabase
    .from('venues')
    .select('id, name, address')
    .eq('club_id', profile.club_id)
    .order('name')

  return data ?? []
}

export async function addVenue(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const name = formData.get('name') as string
  const address = formData.get('address') as string

  if (!name?.trim()) throw new Error('Venue name is required')

  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id')
    .eq('user_id', user.id)
    .single()

  if (!profile?.club_id) throw new Error('Could not find your club')

  const { error } = await supabase
    .from('venues')
    .insert({ name: name.trim(), address: address?.trim() || null, club_id: profile.club_id })

  if (error) throw new Error(`Failed to add venue: ${error.message}`)

  revalidatePath('/dashboard/settings')
}

export async function updateVenue(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const id = formData.get('id') as string
  const name = formData.get('name') as string
  const address = formData.get('address') as string

  if (!id || !name?.trim()) throw new Error('Venue ID and name are required')

  const { error } = await supabase
    .from('venues')
    .update({ name: name.trim(), address: address?.trim() || null })
    .eq('id', id)

  if (error) throw new Error(`Failed to update venue: ${error.message}`)

  revalidatePath('/dashboard/settings')
}

export async function deleteVenue(formData: FormData) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const id = formData.get('id') as string
  if (!id) throw new Error('Venue ID is required')

  const { error } = await supabase.from('venues').delete().eq('id', id)

  if (error) throw new Error(`Failed to delete venue: ${error.message}`)

  revalidatePath('/dashboard/settings')
}
```

- [ ] **Step 2: Create venues section client component**

Create `app-next/app/dashboard/settings/venues-section.tsx`:

```typescript
'use client'

import { useState, useTransition, useEffect } from 'react'
import { getVenues, addVenue, updateVenue, deleteVenue } from './venue-actions'

interface Venue {
  id: string
  name: string
  address: string | null
}

export default function VenuesSection() {
  const [venues, setVenues] = useState<Venue[]>([])
  const [modalOpen, setModalOpen] = useState(false)
  const [editingVenue, setEditingVenue] = useState<Venue | null>(null)
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    loadVenues()
  }, [])

  async function loadVenues() {
    const data = await getVenues()
    setVenues(data)
  }

  function openAdd() {
    setEditingVenue(null)
    setName('')
    setAddress('')
    setError(null)
    setModalOpen(true)
  }

  function openEdit(venue: Venue) {
    setEditingVenue(venue)
    setName(venue.name)
    setAddress(venue.address ?? '')
    setError(null)
    setModalOpen(true)
  }

  function handleSubmit() {
    if (!name.trim()) {
      setError('Venue name is required')
      return
    }
    setError(null)

    const formData = new FormData()
    formData.set('name', name)
    formData.set('address', address)
    if (editingVenue) formData.set('id', editingVenue.id)

    startTransition(async () => {
      try {
        if (editingVenue) {
          await updateVenue(formData)
        } else {
          await addVenue(formData)
        }
        setModalOpen(false)
        await loadVenues()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  function handleDelete(venueId: string) {
    const formData = new FormData()
    formData.set('id', venueId)
    startTransition(async () => {
      try {
        await deleteVenue(formData)
        await loadVenues()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  return (
    <section className="bg-dark-secondary rounded-2xl p-6 border border-white/5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold">Venues</h2>
        <button
          onClick={openAdd}
          className="bg-green text-dark font-bold px-4 py-2 rounded-xl hover:opacity-90 transition-opacity text-sm"
        >
          + Add Venue
        </button>
      </div>

      {venues.length === 0 ? (
        <p className="text-gray text-sm">No venues saved yet. Add your first venue to use when scheduling events.</p>
      ) : (
        <div className="space-y-3">
          {venues.map(venue => (
            <div key={venue.id} className="flex items-center justify-between bg-dark rounded-xl px-4 py-3 border border-white/5">
              <div>
                <p className="font-medium">{venue.name}</p>
                {venue.address && <p className="text-gray text-sm">{venue.address}</p>}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => openEdit(venue)}
                  className="text-gray hover:text-white text-sm transition-colors"
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDelete(venue.id)}
                  disabled={isPending}
                  className="text-red hover:text-red/80 text-sm transition-colors disabled:opacity-50"
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={e => { if (e.target === e.currentTarget) setModalOpen(false) }}
        >
          <div className="bg-dark-secondary rounded-2xl p-8 w-full max-w-md border border-white/10 shadow-2xl">
            <h2 className="text-xl font-bold mb-6">
              {editingVenue ? 'Edit Venue' : 'Add a Venue'}
            </h2>

            <label className="block text-sm font-medium text-gray mb-2">Venue name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Riverside Field"
              className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray focus:outline-none focus:border-green transition-colors mb-4"
              autoFocus
            />

            <label className="block text-sm font-medium text-gray mb-2">Address (optional)</label>
            <input
              type="text"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder="e.g. 123 Main St, Springfield"
              className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray focus:outline-none focus:border-green transition-colors mb-2"
            />

            {error && <p className="text-red text-sm mt-2 mb-2">{error}</p>}

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => { setModalOpen(false); setError(null) }}
                className="flex-1 bg-dark border border-white/10 text-gray font-medium py-3 rounded-xl hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={isPending}
                className="flex-1 bg-green text-dark font-bold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {isPending ? 'Saving…' : editingVenue ? 'Save Changes' : 'Add Venue'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
```

- [ ] **Step 3: Add VenuesSection to settings page**

In `app-next/app/dashboard/settings/page.tsx`, add the import at the top:

```typescript
import VenuesSection from './venues-section'
```

Then add `<VenuesSection />` after the "Club Coaches Link" section and before the "Notifications" section.

- [ ] **Step 4: Verify in browser**

Run `npm run dev`, navigate to `/dashboard/settings`. Verify:
- Venues section appears with "Add Venue" button
- Can add a venue with name + address
- Venue appears in the list
- Can edit and delete venues

- [ ] **Step 5: Commit**

```bash
git add app-next/app/dashboard/settings/venue-actions.ts app-next/app/dashboard/settings/venues-section.tsx app-next/app/dashboard/settings/page.tsx
git commit -m "feat: add venue management to settings page"
```

---

## Task 4: Schedule Page — Server Component and Actions

**Files:**
- Create: `app-next/app/dashboard/schedule/page.tsx`
- Create: `app-next/app/dashboard/schedule/actions.ts`

- [ ] **Step 1: Create schedule server actions**

Create `app-next/app/dashboard/schedule/actions.ts`:

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

// ---------- Types ----------

interface CreateEventInput {
  teamId: string
  type: string
  title: string
  startTime: string
  endTime: string
  venueId: string | null
  notes: string | null
  recurring: {
    enabled: boolean
    days: number[]      // 0=Sun, 1=Mon, etc.
    endDate: string     // ISO date string
  }
}

interface UpdateEventInput {
  eventId: string
  title: string
  startTime: string
  endTime: string
  venueId: string | null
  notes: string | null
  updateFuture: boolean // true = edit all future in series
}

// ---------- Helpers ----------

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

async function notifyTeamMembers(
  eventId: string,
  teamId: string,
  type: 'event_created' | 'event_updated' | 'event_cancelled',
  message: string
) {
  const service = createServiceClient()

  // Get all team members (coaches + parents)
  const { data: members } = await service
    .from('team_members')
    .select('profile_id')
    .eq('team_id', teamId)

  if (!members || members.length === 0) return

  const notifications = members.map(m => ({
    profile_id: m.profile_id,
    event_id: eventId,
    type,
    message,
  }))

  await service.from('notifications').insert(notifications)
}

// ---------- Actions ----------

export async function createEvent(input: CreateEventInput) {
  const { user, profile, supabase } = await getUserProfile()

  if (!input.recurring.enabled) {
    // Single event
    const { data: event, error } = await supabase
      .from('events')
      .insert({
        club_id: profile.club_id,
        team_id: input.teamId,
        type: input.type,
        title: input.title.trim(),
        start_time: input.startTime,
        end_time: input.endTime,
        venue_id: input.venueId,
        notes: input.notes?.trim() || null,
        status: 'scheduled',
        created_by: user.id,
      })
      .select('id')
      .single()

    if (error) throw new Error(`Failed to create event: ${error.message}`)

    await notifyTeamMembers(event.id, input.teamId, 'event_created', `New event: ${input.title.trim()}`)
  } else {
    // Recurring — generate individual events
    const recurrenceGroup = crypto.randomUUID()
    const startDate = new Date(input.startTime)
    const endDate = new Date(input.recurring.endDate)
    const startHour = startDate.getHours()
    const startMin = startDate.getMinutes()
    const endEventTime = new Date(input.endTime)
    const durationMs = endEventTime.getTime() - startDate.getTime()

    const events: Array<{
      club_id: string
      team_id: string
      type: string
      title: string
      start_time: string
      end_time: string
      venue_id: string | null
      notes: string | null
      status: string
      created_by: string
      recurrence_group: string
    }> = []

    // Iterate day by day from start to end
    const cursor = new Date(startDate)
    cursor.setHours(0, 0, 0, 0)
    const endCursor = new Date(endDate)
    endCursor.setHours(23, 59, 59, 999)

    while (cursor <= endCursor) {
      if (input.recurring.days.includes(cursor.getDay())) {
        const eventStart = new Date(cursor)
        eventStart.setHours(startHour, startMin, 0, 0)
        const eventEnd = new Date(eventStart.getTime() + durationMs)

        events.push({
          club_id: profile.club_id!,
          team_id: input.teamId,
          type: input.type,
          title: input.title.trim(),
          start_time: eventStart.toISOString(),
          end_time: eventEnd.toISOString(),
          venue_id: input.venueId,
          notes: input.notes?.trim() || null,
          status: 'scheduled',
          created_by: user.id,
          recurrence_group: recurrenceGroup,
        })
      }
      cursor.setDate(cursor.getDate() + 1)
    }

    if (events.length === 0) throw new Error('No events match the selected days in the date range')

    const { data: inserted, error } = await supabase
      .from('events')
      .insert(events)
      .select('id')

    if (error) throw new Error(`Failed to create recurring events: ${error.message}`)

    // Notify for the first event only (avoid spam)
    if (inserted && inserted.length > 0) {
      await notifyTeamMembers(
        inserted[0].id,
        input.teamId,
        'event_created',
        `New recurring schedule: ${input.title.trim()} (${events.length} events)`
      )
    }
  }

  revalidatePath('/dashboard/schedule')
  revalidatePath('/dashboard')
}

export async function updateEvent(input: UpdateEventInput) {
  const { supabase } = await getUserProfile()

  const updates = {
    title: input.title.trim(),
    start_time: input.startTime,
    end_time: input.endTime,
    venue_id: input.venueId,
    notes: input.notes?.trim() || null,
  }

  if (input.updateFuture) {
    // Get the event to find its recurrence_group and start_time
    const { data: event } = await supabase
      .from('events')
      .select('recurrence_group, start_time, team_id')
      .eq('id', input.eventId)
      .single()

    if (!event?.recurrence_group) throw new Error('Event is not part of a recurring series')

    // Calculate time offset from original to apply to all future events
    const originalStart = new Date(event.start_time)
    const newStart = new Date(input.startTime)
    const offsetMs = newStart.getTime() - originalStart.getTime()

    // Get all future events in this series
    const { data: futureEvents } = await supabase
      .from('events')
      .select('id, start_time, end_time')
      .eq('recurrence_group', event.recurrence_group)
      .gte('start_time', event.start_time)
      .order('start_time')

    if (futureEvents) {
      for (const fe of futureEvents) {
        const feStart = new Date(new Date(fe.start_time).getTime() + offsetMs)
        const feEnd = new Date(new Date(fe.end_time).getTime() + offsetMs)

        await supabase
          .from('events')
          .update({
            title: input.title.trim(),
            start_time: feStart.toISOString(),
            end_time: feEnd.toISOString(),
            venue_id: input.venueId,
            notes: input.notes?.trim() || null,
          })
          .eq('id', fe.id)
      }
    }

    await notifyTeamMembers(
      input.eventId,
      event.team_id,
      'event_updated',
      `Schedule updated: ${input.title.trim()} (this and future events)`
    )
  } else {
    // Single event update
    const { data: event, error } = await supabase
      .from('events')
      .update(updates)
      .eq('id', input.eventId)
      .select('team_id')
      .single()

    if (error) throw new Error(`Failed to update event: ${error.message}`)

    await notifyTeamMembers(input.eventId, event.team_id, 'event_updated', `Event updated: ${input.title.trim()}`)
  }

  revalidatePath('/dashboard/schedule')
  revalidatePath('/dashboard')
}

export async function cancelEvent(eventId: string) {
  const { supabase } = await getUserProfile()

  const { data: event, error } = await supabase
    .from('events')
    .update({ status: 'cancelled' })
    .eq('id', eventId)
    .select('title, team_id')
    .single()

  if (error) throw new Error(`Failed to cancel event: ${error.message}`)

  await notifyTeamMembers(eventId, event.team_id, 'event_cancelled', `Event cancelled: ${event.title}`)

  revalidatePath('/dashboard/schedule')
  revalidatePath('/dashboard')
}

export async function deleteEvent(eventId: string) {
  const { supabase } = await getUserProfile()

  const { error } = await supabase
    .from('events')
    .delete()
    .eq('id', eventId)

  if (error) throw new Error(`Failed to delete event: ${error.message}`)

  revalidatePath('/dashboard/schedule')
  revalidatePath('/dashboard')
}

export async function getScheduleData() {
  const { profile, supabase } = await getUserProfile()

  const { data: events } = await supabase
    .from('events')
    .select(`
      id, team_id, type, title, start_time, end_time,
      venue_id, recurrence_group, notes, status,
      teams ( name, age_group ),
      venues ( name )
    `)
    .eq('club_id', profile.club_id!)
    .order('start_time', { ascending: true })

  const { data: teams } = await supabase
    .from('teams')
    .select('id, name, age_group')
    .eq('club_id', profile.club_id!)
    .order('age_group')

  const { data: venues } = await supabase
    .from('venues')
    .select('id, name, address')
    .eq('club_id', profile.club_id!)
    .order('name')

  return {
    events: events ?? [],
    teams: teams ?? [],
    venues: venues ?? [],
    userRole: profile.role,
  }
}
```

- [ ] **Step 2: Create a placeholder schedule page**

Create `app-next/app/dashboard/schedule/page.tsx` (placeholder until client components are built in Task 7):

```typescript
export default function SchedulePage() {
  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <h1 className="text-3xl font-black tracking-tight">Schedule</h1>
      <p className="text-gray text-sm mt-1">Loading...</p>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add app-next/app/dashboard/schedule/actions.ts app-next/app/dashboard/schedule/page.tsx
git commit -m "feat: add schedule server actions and placeholder page"
```

---

## Task 5: Schedule Client Components — Filters, Event Card, Event Modal

**Files:**
- Create: `app-next/app/dashboard/schedule/filters.tsx`
- Create: `app-next/app/dashboard/schedule/event-card.tsx`
- Create: `app-next/app/dashboard/schedule/event-modal.tsx`

- [ ] **Step 1: Create filters component**

Create `app-next/app/dashboard/schedule/filters.tsx`:

```typescript
'use client'

import { EVENT_TYPES, EVENT_TYPE_LABELS, type EventType } from '@/lib/constants'

interface Team {
  id: string
  name: string
  age_group: string
}

interface FiltersProps {
  teams: Team[]
  selectedTeam: string | null
  selectedType: EventType | null
  onTeamChange: (teamId: string | null) => void
  onTypeChange: (type: EventType | null) => void
}

export default function Filters({ teams, selectedTeam, selectedType, onTeamChange, onTypeChange }: FiltersProps) {
  return (
    <div className="flex flex-wrap gap-3">
      <select
        value={selectedTeam ?? ''}
        onChange={e => onTeamChange(e.target.value || null)}
        className="bg-dark border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-green transition-colors appearance-none"
      >
        <option value="">All Teams</option>
        {teams.map(t => (
          <option key={t.id} value={t.id}>{t.name} ({t.age_group})</option>
        ))}
      </select>

      <select
        value={selectedType ?? ''}
        onChange={e => onTypeChange((e.target.value || null) as EventType | null)}
        className="bg-dark border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-green transition-colors appearance-none"
      >
        <option value="">All Types</option>
        {EVENT_TYPES.map(t => (
          <option key={t} value={t}>{EVENT_TYPE_LABELS[t]}</option>
        ))}
      </select>
    </div>
  )
}
```

- [ ] **Step 2: Create event card component**

Create `app-next/app/dashboard/schedule/event-card.tsx`:

```typescript
'use client'

import { EVENT_TYPE_LABELS, type EventType } from '@/lib/constants'

interface EventCardProps {
  event: {
    id: string
    type: string
    title: string
    start_time: string
    end_time: string
    status: string
    notes: string | null
    recurrence_group: string | null
    teams: { name: string; age_group: string } | null
    venues: { name: string } | null
  }
  onEdit: (eventId: string) => void
  onCancel: (eventId: string) => void
  canEdit: boolean
}

export default function EventCard({ event, onEdit, onCancel, canEdit }: EventCardProps) {
  const start = new Date(event.start_time)
  const end = new Date(event.end_time)
  const isCancelled = event.status === 'cancelled'

  const timeStr = `${formatTime(start)} – ${formatTime(end)}`

  return (
    <div
      className={`bg-dark-secondary rounded-xl p-4 border border-white/5 ${
        isCancelled ? 'opacity-50' : 'hover:border-green/20'
      } transition-colors`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-bold bg-green/10 text-green px-2 py-0.5 rounded-full">
              {event.teams?.age_group}
            </span>
            <span className="text-xs font-medium bg-white/5 text-gray px-2 py-0.5 rounded-full">
              {EVENT_TYPE_LABELS[event.type as EventType] ?? event.type}
            </span>
            {isCancelled && (
              <span className="text-xs font-bold bg-red/10 text-red px-2 py-0.5 rounded-full">
                Cancelled
              </span>
            )}
            {event.recurrence_group && (
              <span className="text-xs text-gray" title="Recurring event">
                ↻
              </span>
            )}
          </div>
          <p className={`font-bold ${isCancelled ? 'line-through text-gray' : 'text-white'}`}>
            {event.title}
          </p>
          <p className="text-gray text-sm mt-1">{timeStr}</p>
          {event.venues?.name && (
            <p className="text-gray text-sm">{event.venues.name}</p>
          )}
          {event.notes && (
            <p className="text-gray text-xs mt-2 italic">{event.notes}</p>
          )}
        </div>

        {canEdit && !isCancelled && (
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => onEdit(event.id)}
              className="text-gray hover:text-white text-sm transition-colors"
            >
              Edit
            </button>
            <button
              onClick={() => onCancel(event.id)}
              className="text-red hover:text-red/80 text-sm transition-colors"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}
```

- [ ] **Step 3: Create event modal component**

Create `app-next/app/dashboard/schedule/event-modal.tsx`:

```typescript
'use client'

import { useState, useTransition } from 'react'
import { EVENT_TYPES, EVENT_TYPE_LABELS, DAYS_OF_WEEK, type EventType } from '@/lib/constants'
import { createEvent, updateEvent } from './actions'

interface Team {
  id: string
  name: string
  age_group: string
}

interface Venue {
  id: string
  name: string
  address: string | null
}

interface EventData {
  id: string
  team_id: string
  type: string
  title: string
  start_time: string
  end_time: string
  venue_id: string | null
  notes: string | null
  recurrence_group: string | null
}

interface EventModalProps {
  teams: Team[]
  venues: Venue[]
  editEvent: EventData | null  // null = creating new
  onClose: () => void
}

export default function EventModal({ teams, venues, editEvent, onClose }: EventModalProps) {
  const isEditing = editEvent !== null

  const [teamId, setTeamId] = useState(editEvent?.team_id ?? teams[0]?.id ?? '')
  const [type, setType] = useState<EventType>((editEvent?.type as EventType) ?? 'practice')
  const [title, setTitle] = useState(editEvent?.title ?? '')
  const [date, setDate] = useState(editEvent ? new Date(editEvent.start_time).toISOString().split('T')[0] : '')
  const [startTime, setStartTime] = useState(editEvent ? formatTimeInput(new Date(editEvent.start_time)) : '')
  const [endTime, setEndTime] = useState(editEvent ? formatTimeInput(new Date(editEvent.end_time)) : '')
  const [venueId, setVenueId] = useState(editEvent?.venue_id ?? '')
  const [notes, setNotes] = useState(editEvent?.notes ?? '')
  const [recurringEnabled, setRecurringEnabled] = useState(false)
  const [recurringDays, setRecurringDays] = useState<number[]>([])
  const [recurringEndDate, setRecurringEndDate] = useState('')
  const [updateFuture, setUpdateFuture] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  // Auto-generate title from team + type
  const selectedTeam = teams.find(t => t.id === teamId)
  const autoTitle = selectedTeam
    ? `${selectedTeam.name} ${EVENT_TYPE_LABELS[type]}`
    : ''

  function handleSubmit() {
    const finalTitle = title.trim() || autoTitle
    if (!teamId || !date || !startTime || !endTime || !finalTitle) {
      setError('Please fill in all required fields')
      return
    }

    // Construct ISO strings preserving the user's intended local time
    // The server action receives these as UTC — the browser's Date constructor
    // interprets `YYYY-MM-DDTHH:MM` as local time, so toISOString() converts correctly
    const startISO = new Date(`${date}T${startTime}`).toISOString()
    const endISO = new Date(`${date}T${endTime}`).toISOString()

    if (new Date(endISO) <= new Date(startISO)) {
      setError('End time must be after start time')
      return
    }

    if (recurringEnabled && (recurringDays.length === 0 || !recurringEndDate)) {
      setError('Select at least one day and an end date for recurring events')
      return
    }

    setError(null)

    startTransition(async () => {
      try {
        if (isEditing) {
          await updateEvent({
            eventId: editEvent.id,
            title: finalTitle,
            startTime: startISO,
            endTime: endISO,
            venueId: venueId || null,
            notes: notes.trim() || null,
            updateFuture,
          })
        } else {
          await createEvent({
            teamId,
            type,
            title: finalTitle,
            startTime: startISO,
            endTime: endISO,
            venueId: venueId || null,
            notes: notes.trim() || null,
            recurring: {
              enabled: recurringEnabled,
              days: recurringDays,
              endDate: recurringEndDate,
            },
          })
        }
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  function toggleDay(day: number) {
    setRecurringDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]
    )
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-dark-secondary rounded-2xl p-8 w-full max-w-lg border border-white/10 shadow-2xl my-8">
        <h2 className="text-xl font-bold mb-6">
          {isEditing ? 'Edit Event' : 'Add Event'}
        </h2>

        {/* Team */}
        {!isEditing && (
          <>
            <label className="block text-sm font-medium text-gray mb-2">Team</label>
            <select
              value={teamId}
              onChange={e => setTeamId(e.target.value)}
              className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-green transition-colors appearance-none mb-4"
            >
              {teams.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.age_group})</option>
              ))}
            </select>
          </>
        )}

        {/* Type */}
        {!isEditing && (
          <>
            <label className="block text-sm font-medium text-gray mb-2">Type</label>
            <select
              value={type}
              onChange={e => setType(e.target.value as EventType)}
              className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-green transition-colors appearance-none mb-4"
            >
              {EVENT_TYPES.map(t => (
                <option key={t} value={t}>{EVENT_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </>
        )}

        {/* Title */}
        <label className="block text-sm font-medium text-gray mb-2">Title</label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder={autoTitle || 'Event title'}
          className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray focus:outline-none focus:border-green transition-colors mb-4"
        />

        {/* Date */}
        <label className="block text-sm font-medium text-gray mb-2">Date</label>
        <input
          type="date"
          value={date}
          onChange={e => setDate(e.target.value)}
          className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-green transition-colors mb-4"
        />

        {/* Time */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-gray mb-2">Start time</label>
            <input
              type="time"
              value={startTime}
              onChange={e => setStartTime(e.target.value)}
              className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-green transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray mb-2">End time</label>
            <input
              type="time"
              value={endTime}
              onChange={e => setEndTime(e.target.value)}
              className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-green transition-colors"
            />
          </div>
        </div>

        {/* Venue */}
        <label className="block text-sm font-medium text-gray mb-2">Venue</label>
        <select
          value={venueId}
          onChange={e => setVenueId(e.target.value)}
          className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-green transition-colors appearance-none mb-4"
        >
          <option value="">No venue selected</option>
          {venues.map(v => (
            <option key={v.id} value={v.id}>{v.name}</option>
          ))}
        </select>

        {/* Notes */}
        <label className="block text-sm font-medium text-gray mb-2">Notes (optional)</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Any additional details..."
          rows={2}
          className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray focus:outline-none focus:border-green transition-colors mb-4 resize-none"
        />

        {/* Recurring (create only) */}
        {!isEditing && (
          <div className="mb-4">
            <label className="flex items-center gap-3 cursor-pointer mb-3">
              <input
                type="checkbox"
                checked={recurringEnabled}
                onChange={e => setRecurringEnabled(e.target.checked)}
                className="w-4 h-4 accent-green"
              />
              <span className="text-sm font-medium">Recurring event</span>
            </label>

            {recurringEnabled && (
              <div className="pl-7 space-y-3">
                <div>
                  <label className="block text-sm text-gray mb-2">Repeat on</label>
                  <div className="flex gap-2">
                    {DAYS_OF_WEEK.map(day => (
                      <button
                        key={day.value}
                        type="button"
                        onClick={() => toggleDay(day.value)}
                        className={`w-10 h-10 rounded-lg text-sm font-bold transition-colors ${
                          recurringDays.includes(day.value)
                            ? 'bg-green text-dark'
                            : 'bg-dark border border-white/10 text-gray hover:text-white'
                        }`}
                      >
                        {day.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-sm text-gray mb-2">Until</label>
                  <input
                    type="date"
                    value={recurringEndDate}
                    onChange={e => setRecurringEndDate(e.target.value)}
                    className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-green transition-colors"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        {/* Edit future toggle (edit recurring only) */}
        {isEditing && editEvent?.recurrence_group && (
          <label className="flex items-center gap-3 cursor-pointer mb-4">
            <input
              type="checkbox"
              checked={updateFuture}
              onChange={e => setUpdateFuture(e.target.checked)}
              className="w-4 h-4 accent-green"
            />
            <span className="text-sm font-medium">Apply to all future events in this series</span>
          </label>
        )}

        {error && <p className="text-red text-sm mb-4">{error}</p>}

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 bg-dark border border-white/10 text-gray font-medium py-3 rounded-xl hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={isPending}
            className="flex-1 bg-green text-dark font-bold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isPending ? 'Saving…' : isEditing ? 'Save Changes' : 'Add Event'}
          </button>
        </div>
      </div>
    </div>
  )
}

function formatTimeInput(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
}
```

- [ ] **Step 4: Commit**

```bash
git add app-next/app/dashboard/schedule/filters.tsx app-next/app/dashboard/schedule/event-card.tsx app-next/app/dashboard/schedule/event-modal.tsx
git commit -m "feat: add schedule client components — filters, event card, event modal"
```

---

## Task 6: Schedule Views — Agenda and Calendar

**Files:**
- Create: `app-next/app/dashboard/schedule/agenda-view.tsx`
- Create: `app-next/app/dashboard/schedule/calendar-view.tsx`

- [ ] **Step 1: Create agenda view component**

Create `app-next/app/dashboard/schedule/agenda-view.tsx`:

```typescript
'use client'

import EventCard from './event-card'

interface Event {
  id: string
  team_id: string
  type: string
  title: string
  start_time: string
  end_time: string
  status: string
  notes: string | null
  recurrence_group: string | null
  teams: { name: string; age_group: string } | null
  venues: { name: string } | null
}

interface AgendaViewProps {
  events: Event[]
  onEdit: (eventId: string) => void
  onCancel: (eventId: string) => void
  canEdit: boolean
}

export default function AgendaView({ events, onEdit, onCancel, canEdit }: AgendaViewProps) {
  if (events.length === 0) {
    return (
      <div className="bg-dark-secondary rounded-2xl p-12 text-center border border-white/5">
        <p className="text-gray text-lg">No events scheduled yet.</p>
        <p className="text-gray text-sm mt-1">Add your first event to get started.</p>
      </div>
    )
  }

  // Group events by date
  const grouped = groupByDate(events)
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  return (
    <div className="space-y-8">
      {grouped.map(({ dateStr, label, events: dayEvents, isPast }) => (
        <div key={dateStr} className={isPast ? 'opacity-50' : ''}>
          <h3 className="text-sm font-bold text-gray uppercase tracking-wider mb-3">
            {label}
          </h3>
          <div className="space-y-3">
            {dayEvents.map(event => (
              <EventCard
                key={event.id}
                event={event}
                onEdit={onEdit}
                onCancel={onCancel}
                canEdit={canEdit}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

interface DateGroup {
  dateStr: string
  label: string
  events: Event[]
  isPast: boolean
}

function groupByDate(events: Event[]): DateGroup[] {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const groups: Map<string, Event[]> = new Map()

  for (const event of events) {
    const date = new Date(event.start_time)
    const dateStr = date.toISOString().split('T')[0]
    if (!groups.has(dateStr)) groups.set(dateStr, [])
    groups.get(dateStr)!.push(event)
  }

  return Array.from(groups.entries()).map(([dateStr, events]) => {
    const date = new Date(dateStr + 'T00:00:00')
    const isPast = date < today

    let label: string
    const diffDays = Math.round((date.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

    if (diffDays === 0) label = 'Today'
    else if (diffDays === 1) label = 'Tomorrow'
    else if (diffDays === -1) label = 'Yesterday'
    else label = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

    return { dateStr, label, events, isPast }
  })
}
```

- [ ] **Step 2: Create calendar view component**

Create `app-next/app/dashboard/schedule/calendar-view.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { EVENT_TYPE_LABELS, type EventType } from '@/lib/constants'

interface Event {
  id: string
  team_id: string
  type: string
  title: string
  start_time: string
  end_time: string
  status: string
  teams: { name: string; age_group: string } | null
  venues: { name: string } | null
}

interface CalendarViewProps {
  events: Event[]
  onEdit: (eventId: string) => void
  onAddAtDate: (date: string) => void
}

export default function CalendarView({ events, onEdit, onAddAtDate }: CalendarViewProps) {
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()))

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })

  const hours = Array.from({ length: 15 }, (_, i) => i + 6) // 6am to 8pm

  function prevWeek() {
    const d = new Date(weekStart)
    d.setDate(d.getDate() - 7)
    setWeekStart(d)
  }

  function nextWeek() {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + 7)
    setWeekStart(d)
  }

  function goToday() {
    setWeekStart(getMonday(new Date()))
  }

  const weekLabel = `${days[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${days[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

  return (
    <div>
      {/* Week navigation */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button onClick={prevWeek} className="text-gray hover:text-white transition-colors text-sm font-bold px-2 py-1">
            &lt;
          </button>
          <span className="text-sm font-bold min-w-[200px] text-center">{weekLabel}</span>
          <button onClick={nextWeek} className="text-gray hover:text-white transition-colors text-sm font-bold px-2 py-1">
            &gt;
          </button>
        </div>
        <button onClick={goToday} className="text-green text-sm font-bold hover:opacity-80 transition-opacity">
          Today
        </button>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <div className="min-w-[700px]">
          {/* Day headers */}
          <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-white/5 pb-2 mb-2">
            <div />
            {days.map(day => {
              const isToday = isSameDay(day, new Date())
              return (
                <div
                  key={day.toISOString()}
                  className={`text-center text-sm ${isToday ? 'text-green font-bold' : 'text-gray font-medium'}`}
                >
                  <div>{day.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                  <div className={`text-lg ${isToday ? 'text-green' : 'text-white'}`}>
                    {day.getDate()}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Hour rows */}
          <div className="relative">
            {hours.map(hour => (
              <div key={hour} className="grid grid-cols-[60px_repeat(7,1fr)] h-16 border-b border-white/5">
                <div className="text-xs text-gray pr-2 text-right pt-1">
                  {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
                </div>
                {days.map(day => (
                  <div
                    key={`${day.toISOString()}-${hour}`}
                    className="border-l border-white/5 relative cursor-pointer hover:bg-white/[0.02] transition-colors"
                    onClick={() => onAddAtDate(day.toISOString().split('T')[0])}
                  >
                    {getEventsForSlot(events, day, hour).map(event => (
                      <button
                        key={event.id}
                        onClick={e => { e.stopPropagation(); onEdit(event.id) }}
                        className={`absolute left-0.5 right-0.5 rounded px-1 py-0.5 text-xs font-medium truncate text-left ${
                          event.status === 'cancelled'
                            ? 'bg-red/20 text-red line-through'
                            : 'bg-green/20 text-green hover:bg-green/30'
                        } transition-colors`}
                        style={{
                          top: `${(new Date(event.start_time).getMinutes() / 60) * 100}%`,
                          height: `${Math.max(25, getEventDurationPercent(event) * 64)}px`,
                        }}
                        title={`${event.title} — ${event.teams?.age_group}`}
                      >
                        {event.teams?.age_group} {EVENT_TYPE_LABELS[event.type as EventType]?.[0] ?? ''}
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function getEventsForSlot(events: Event[], day: Date, hour: number): Event[] {
  return events.filter(event => {
    const start = new Date(event.start_time)
    return isSameDay(start, day) && start.getHours() === hour
  })
}

function getEventDurationPercent(event: Event): number {
  const start = new Date(event.start_time)
  const end = new Date(event.end_time)
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60) // hours
}
```

- [ ] **Step 3: Commit**

```bash
git add app-next/app/dashboard/schedule/agenda-view.tsx app-next/app/dashboard/schedule/calendar-view.tsx
git commit -m "feat: add agenda and calendar view components"
```

---

## Task 7: Wire Up Schedule Page

**Files:**
- Modify: `app-next/app/dashboard/schedule/page.tsx` — complete with client wrapper

- [ ] **Step 1: Rewrite schedule page with client wrapper**

Replace `app-next/app/dashboard/schedule/page.tsx` with:

```typescript
import { getScheduleData } from './actions'
import ScheduleClient from './schedule-client'

export default async function SchedulePage() {
  const data = await getScheduleData()

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <ScheduleClient
        events={data.events}
        teams={data.teams}
        venues={data.venues}
        userRole={data.userRole}
      />
    </div>
  )
}
```

- [ ] **Step 2: Create schedule client wrapper**

Create `app-next/app/dashboard/schedule/schedule-client.tsx`:

```typescript
'use client'

import { useState, useTransition } from 'react'
import { ROLES } from '@/lib/constants'
import type { EventType } from '@/lib/constants'
import Filters from './filters'
import AgendaView from './agenda-view'
import CalendarView from './calendar-view'
import EventModal from './event-modal'
import { cancelEvent } from './actions'

interface Event {
  id: string
  team_id: string
  type: string
  title: string
  start_time: string
  end_time: string
  status: string
  notes: string | null
  venue_id: string | null
  recurrence_group: string | null
  teams: { name: string; age_group: string } | null
  venues: { name: string } | null
}

interface Team {
  id: string
  name: string
  age_group: string
}

interface Venue {
  id: string
  name: string
  address: string | null
}

interface ScheduleClientProps {
  events: Event[]
  teams: Team[]
  venues: Venue[]
  userRole: string
}

export default function ScheduleClient({ events, teams, venues, userRole }: ScheduleClientProps) {
  const [view, setView] = useState<'agenda' | 'calendar'>('agenda')
  const [filterTeam, setFilterTeam] = useState<string | null>(null)
  const [filterType, setFilterType] = useState<EventType | null>(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [editEvent, setEditEvent] = useState<Event | null>(null)
  const [, startTransition] = useTransition()

  const canEdit = userRole === ROLES.DOC || userRole === ROLES.COACH

  // Apply filters
  const filtered = events.filter(e => {
    if (filterTeam && e.team_id !== filterTeam) return false
    if (filterType && e.type !== filterType) return false
    return true
  })

  function handleEdit(eventId: string) {
    const event = events.find(e => e.id === eventId)
    if (event) {
      setEditEvent(event)
      setModalOpen(true)
    }
  }

  function handleCancel(eventId: string) {
    if (!confirm('Cancel this event? Coaches and parents will be notified.')) return
    startTransition(async () => {
      await cancelEvent(eventId)
    })
  }

  function handleAddNew() {
    setEditEvent(null)
    setModalOpen(true)
  }

  function handleAddAtDate(_date: string) {
    // Could pre-fill date in modal — for now just open add modal
    setEditEvent(null)
    setModalOpen(true)
  }

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Schedule</h1>
          <p className="text-gray text-sm mt-1">
            {filtered.length} event{filtered.length !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {/* View toggle */}
          <div className="flex bg-dark rounded-xl border border-white/10 overflow-hidden">
            <button
              onClick={() => setView('agenda')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                view === 'agenda' ? 'bg-green text-dark' : 'text-gray hover:text-white'
              }`}
            >
              Agenda
            </button>
            <button
              onClick={() => setView('calendar')}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                view === 'calendar' ? 'bg-green text-dark' : 'text-gray hover:text-white'
              }`}
            >
              Calendar
            </button>
          </div>

          {canEdit && (
            <button
              onClick={handleAddNew}
              className="bg-green text-dark font-bold px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity text-sm"
            >
              + Add Event
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6">
        <Filters
          teams={teams}
          selectedTeam={filterTeam}
          selectedType={filterType}
          onTeamChange={setFilterTeam}
          onTypeChange={setFilterType}
        />
      </div>

      {/* View */}
      {view === 'agenda' ? (
        <AgendaView
          events={filtered}
          onEdit={handleEdit}
          onCancel={handleCancel}
          canEdit={canEdit}
        />
      ) : (
        <CalendarView
          events={filtered}
          onEdit={handleEdit}
          onAddAtDate={handleAddAtDate}
        />
      )}

      {/* Modal */}
      {modalOpen && (
        <EventModal
          teams={teams}
          venues={venues}
          editEvent={editEvent}
          onClose={() => { setModalOpen(false); setEditEvent(null) }}
        />
      )}
    </>
  )
}
```

- [ ] **Step 3: Verify in browser**

Run `npm run dev`, navigate to `/dashboard/schedule`. Verify:
- Empty state shows "No events scheduled yet"
- "Add Event" button opens modal
- Can create a single event (pick team, type, date, time, venue)
- Event appears in agenda view
- Can toggle to calendar view and see the event
- Can edit and cancel events
- Filters work

- [ ] **Step 4: Commit**

```bash
git add app-next/app/dashboard/schedule/page.tsx app-next/app/dashboard/schedule/schedule-client.tsx
git commit -m "feat: wire up schedule page with client wrapper, views, and modal"
```

---

## Task 8: Notification Bell

**Files:**
- Create: `app-next/components/notification-bell.tsx`
- Modify: `app-next/components/sidebar.tsx`

- [ ] **Step 1: Create notification bell component**

Create `app-next/components/notification-bell.tsx`:

```typescript
'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

interface Notification {
  id: string
  event_id: string
  type: string
  message: string
  read: boolean
  created_at: string
}

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [open, setOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const router = useRouter()

  useEffect(() => {
    loadNotifications()

    // Close dropdown on outside click
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function loadNotifications() {
    const supabase = createClient()
    const { data } = await supabase
      .from('notifications')
      .select('id, event_id, type, message, read, created_at')
      .order('created_at', { ascending: false })
      .limit(20)

    if (data) {
      setNotifications(data)
      setUnreadCount(data.filter(n => !n.read).length)
    }
  }

  async function markAsRead(notificationId: string) {
    const supabase = createClient()
    await supabase
      .from('notifications')
      .update({ read: true })
      .eq('id', notificationId)

    setNotifications(prev =>
      prev.map(n => n.id === notificationId ? { ...n, read: true } : n)
    )
    setUnreadCount(prev => Math.max(0, prev - 1))
  }

  async function markAllRead() {
    const supabase = createClient()
    const unreadIds = notifications.filter(n => !n.read).map(n => n.id)
    if (unreadIds.length === 0) return

    await supabase
      .from('notifications')
      .update({ read: true })
      .in('id', unreadIds)

    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    setUnreadCount(0)
  }

  function timeAgo(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime()
    const mins = Math.floor(diff / 60000)
    if (mins < 1) return 'just now'
    if (mins < 60) return `${mins}m ago`
    const hrs = Math.floor(mins / 60)
    if (hrs < 24) return `${hrs}h ago`
    const days = Math.floor(hrs / 24)
    return `${days}d ago`
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => { setOpen(!open); if (!open) loadNotifications() }}
        className="relative text-gray hover:text-white transition-colors p-1"
        title="Notifications"
      >
        {/* Bell SVG */}
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 bg-red text-white text-[10px] font-bold w-4 h-4 flex items-center justify-center rounded-full">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-dark-secondary rounded-xl border border-white/10 shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/5">
            <span className="text-sm font-bold">Notifications</span>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-green hover:text-green/80 transition-colors"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="text-gray text-sm text-center py-8">No notifications yet</p>
            ) : (
              notifications.map(n => (
                <button
                  key={n.id}
                  onClick={() => { markAsRead(n.id); setOpen(false); router.push('/dashboard/schedule') }}
                  className={`w-full text-left px-4 py-3 border-b border-white/5 hover:bg-white/[0.03] transition-colors ${
                    !n.read ? 'bg-green/[0.03]' : ''
                  }`}
                >
                  <div className="flex items-start gap-2">
                    {!n.read && (
                      <span className="w-2 h-2 bg-green rounded-full mt-1.5 shrink-0" />
                    )}
                    <div className={!n.read ? '' : 'pl-4'}>
                      <p className="text-sm text-white">{n.message}</p>
                      <p className="text-xs text-gray mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Add notification bell to sidebar**

In `app-next/components/sidebar.tsx`:

Add import at top:
```typescript
import NotificationBell from './notification-bell'
```

Find the user email display area in the sidebar (near the bottom, before the sign-out form) and add `<NotificationBell />` next to the email display. The exact placement: look for the section that shows `userEmail` and add the bell icon beside it.

Also, find the `Schedule` nav item and remove `disabled: true` so the link becomes active:
```typescript
{ label: 'Schedule', href: '/dashboard/schedule', icon: <CalendarIcon /> },
```

- [ ] **Step 3: Verify in browser**

- Bell icon appears in sidebar with unread count
- Click bell → dropdown with notifications
- Creating/cancelling events generates notifications for team members
- "Mark all read" works
- Schedule link in sidebar is now active and navigates correctly

- [ ] **Step 4: Commit**

```bash
git add app-next/components/notification-bell.tsx app-next/components/sidebar.tsx
git commit -m "feat: add notification bell to sidebar, enable schedule link"
```

---

## Task 9: Wire Up Dashboard Stats

**Files:**
- Modify: `app-next/app/dashboard/page.tsx`

- [ ] **Step 1: Update "Today's Sessions" stat card**

In `app-next/app/dashboard/page.tsx`, add a query after the team count query to count today's events:

```typescript
// Count today's sessions
const todayStart = new Date()
todayStart.setHours(0, 0, 0, 0)
const todayEnd = new Date()
todayEnd.setHours(23, 59, 59, 999)

const { count: todaySessions } = profile?.club_id
  ? await supabase
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('club_id', profile.club_id)
      .eq('status', 'scheduled')
      .gte('start_time', todayStart.toISOString())
      .lte('start_time', todayEnd.toISOString())
  : { count: 0 }
```

Then update the "Today's Sessions" StatCard:
```typescript
<StatCard
  label="Today's Sessions"
  value={String(todaySessions ?? 0)}
  accent="green"
/>
```

Remove the `note="Coming soon"` prop and change accent from `"gray"` to `"green"`.

- [ ] **Step 2: Add "Schedule" quick action for new clubs**

Add alongside the existing quick actions:
```typescript
<QuickAction
  href="/dashboard/schedule"
  title="Create a schedule"
  description="Set up practices, games, and events for your teams."
  icon="📅"
/>
```

- [ ] **Step 3: Verify in browser**

- Dashboard shows today's event count (0 if none, actual count if events exist today)
- "Create a schedule" quick action appears for new clubs

- [ ] **Step 4: Commit**

```bash
git add app-next/app/dashboard/page.tsx
git commit -m "feat: wire up today's sessions stat and schedule quick action on dashboard"
```

---

## Task 10: Final Verification

- [ ] **Step 1: Run build**

```bash
cd app-next && npm run build
```

Expected: Build succeeds with no errors.

- [ ] **Step 2: Full manual test flow**

1. Log in as DOC
2. Go to Settings → add 2 venues
3. Go to Schedule → empty state shows
4. Add a single practice event (pick team, date, time, venue)
5. Event appears in agenda view
6. Toggle to calendar view — event appears on the grid
7. Edit the event — change venue
8. Cancel the event — shows as cancelled with red badge
9. Create a recurring event (e.g., Tue/Thu for 4 weeks)
10. Verify all events appear in agenda view grouped by date
11. Filter by team, filter by type — verify filtering works
12. Check notification bell — notifications appear for created/updated/cancelled events
13. Check dashboard — "Today's Sessions" shows correct count

- [ ] **Step 3: Commit any fixes**

If any issues found during testing, fix and commit with descriptive message.
