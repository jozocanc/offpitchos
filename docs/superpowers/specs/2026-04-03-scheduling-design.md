# OffPitchOS Scheduling — Design Spec

## Overview

The scheduling sub-project adds event management to OffPitchOS — the core daily-use feature for DOCs and coaches. It covers creating, editing, and cancelling events (practices, games, tournaments, camps, tryouts, meetings, custom), recurring schedules, saved venues, and in-app notifications.

## Approach

**Event-based with smart recurrence.** Individual events are stored as rows in the database. Recurring patterns (e.g., "U14 practices every Tue/Thu 6pm, Sep–Nov") expand into individual event rows sharing a `recurrence_group` UUID. This keeps queries simple, makes single-event edits trivial, and sets up future voice-driven changes cleanly.

No RRULE parsing. No calendar library dependency. Agenda view is a sorted query; calendar view renders from the same data.

## Database Schema

### `venues`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | default gen_random_uuid() |
| club_id | uuid FK → clubs.id ON DELETE CASCADE | |
| name | text NOT NULL | e.g., "Riverside Field" |
| address | text | Full address for future maps integration |
| created_at | timestamptz | default now() |

### `events`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | default gen_random_uuid() |
| club_id | uuid FK → clubs.id ON DELETE CASCADE | |
| team_id | uuid FK → teams.id ON DELETE CASCADE | Deleting a team deletes its events |
| type | text NOT NULL | CHECK (type IN ('practice', 'game', 'tournament', 'camp', 'tryout', 'meeting', 'custom')) |
| title | text NOT NULL | Auto-generated or custom (e.g., "U14 Practice") |
| start_time | timestamptz NOT NULL | |
| end_time | timestamptz NOT NULL | CHECK (end_time > start_time) |
| venue_id | uuid FK → venues.id ON DELETE SET NULL | nullable — venue deletion doesn't delete events |
| recurrence_group | uuid | nullable — links events from the same recurring pattern |
| notes | text | nullable |
| status | text NOT NULL DEFAULT 'scheduled' | CHECK (status IN ('scheduled', 'cancelled')) |
| created_by | uuid FK → auth.users(id) | Matches existing pattern (clubs.created_by) |
| created_at | timestamptz | default now() |
| updated_at | timestamptz | default now() |

**Triggers:**
- `events_updated_at BEFORE UPDATE` — reuses existing `update_updated_at()` function

**Indexes:**
- events(club_id)
- events(team_id, start_time) — composite for common query pattern
- events(start_time)
- events(recurrence_group) WHERE recurrence_group IS NOT NULL
- events(status)

**Deletion:** Hard delete. The `cancelled` status is for events the DOC wants to keep visible as cancelled (so parents see it was cancelled, not just missing). Delete removes the row entirely — used for cleanup or removing mistakenly created events.

### `notifications`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | default gen_random_uuid() |
| profile_id | uuid FK → profiles.id ON DELETE CASCADE | recipient |
| event_id | uuid FK → events.id ON DELETE CASCADE | related event |
| type | text NOT NULL | CHECK (type IN ('event_created', 'event_updated', 'event_cancelled')) |
| message | text NOT NULL | human-readable |
| read | boolean NOT NULL DEFAULT false | |
| created_at | timestamptz | default now() |

**Indexes:**
- notifications(profile_id)
- notifications(profile_id, read) WHERE read = false
- notifications(event_id)

## Row-Level Security

All policies MUST use the existing `SECURITY DEFINER` helper functions (`get_user_club_ids()`, `get_doc_club_ids()`, `get_user_team_ids()`, `get_user_profile_ids()`, `get_doc_team_ids()`) to avoid the RLS recursion bugs encountered in sub-project 1.

### `venues`

```sql
-- DOC: full CRUD for venues in their club
CREATE POLICY venues_doc_all ON venues FOR ALL
  USING (club_id IN (SELECT get_doc_club_ids()));

-- All club members: read venues in their club
CREATE POLICY venues_member_read ON venues FOR SELECT
  USING (club_id IN (SELECT get_user_club_ids()));
```

### `events`

```sql
-- DOC: full CRUD for all events in their club
CREATE POLICY events_doc_all ON events FOR ALL
  USING (club_id IN (SELECT get_doc_club_ids()));

-- Coach: full CRUD for events on teams they belong to
CREATE POLICY events_coach_all ON events FOR ALL
  USING (team_id IN (SELECT get_user_team_ids())
    AND club_id NOT IN (SELECT get_doc_club_ids()));
    -- exclude DOC clubs to avoid duplicate policy matches

-- Parent: read-only for events on teams they belong to
CREATE POLICY events_member_read ON events FOR SELECT
  USING (team_id IN (SELECT get_user_team_ids()));
```

### `notifications`

```sql
-- Users can read their own notifications
CREATE POLICY notifications_own_read ON notifications FOR SELECT
  USING (profile_id IN (SELECT get_user_profile_ids()));

-- Users can mark their own notifications as read
CREATE POLICY notifications_own_update ON notifications FOR UPDATE
  USING (profile_id IN (SELECT get_user_profile_ids()))
  WITH CHECK (profile_id IN (SELECT get_user_profile_ids()));

-- System inserts (via server actions with service role key)
-- No INSERT policy for regular users — notifications are created server-side
```

## Notification Mechanism

Notifications are created **server-side in `actions.ts`**, not via database triggers. Rationale:
- The recipient list requires querying `team_members` for the affected team — complex for a trigger
- Server actions already have the context (which team, what changed)
- Easier to control notification message formatting
- Notifications are inserted using the Supabase service role client (bypasses RLS)

Flow:
1. Server action creates/updates/cancels event
2. Same action queries `team_members` for coaches + parents on that team
3. Inserts a notification row per recipient
4. Returns success to the client

## Pages & UI

### `/dashboard/schedule` — Main Schedule Page

Two views with a toggle, agenda as default.

**Agenda view (default):**
- Events grouped by date, today first
- Each event card: time, team name (color-coded), type badge, venue, status
- "Today" section pinned at top
- Past events faded/collapsed
- Filters: team, event type
- "Add Event" button top-right
- Empty state: "No events scheduled yet. Add your first event to get started."

**Calendar view:**
- Weekly grid (month view intentionally excluded — weekly is the useful DOC view)
- Events as colored blocks by team
- Click event → view/edit
- Click empty slot → create new event

### Add/Edit Event Modal

Fields:
- Team (dropdown)
- Type (practice, game, tournament, camp, tryout, meeting, custom)
- Date + start time + end time
- Venue (dropdown of saved venues + "Add new venue" inline option)
- Recurring toggle:
  - If on: pick days of week + end date
  - System generates individual event rows with shared recurrence_group
- Notes (optional text)

For edits on recurring events:
- "Edit this event only" — updates the single row
- "Edit all future events in this series" — updates all events in the recurrence_group with start_time >= this event's start_time. Only time, venue, and notes are bulk-editable. Type and team cannot change in bulk (that would fundamentally change what the events are).

### Venue Management

Accessible from Settings page as a new "Venues" section. The venues section is a client component imported by the existing settings server page (same pattern as other interactive sections).
- List saved venues (name + address)
- Add / edit / delete via modal
- Simple CRUD

### Notification Bell

In the sidebar header area:
- Bell icon with unread count badge
- Click → dropdown of recent notifications (last 20)
- Each notification: message + timestamp + read/unread indicator
- Click notification → mark as read + navigate to the event
- No separate notifications page

## Access Control

| Action | DOC | Coach | Parent |
|--------|-----|-------|--------|
| Create/edit/delete events (any team) | Yes | No | No |
| Create/edit/delete events (own teams) | Yes | Yes | No |
| View events (own teams) | Yes | Yes | Yes |
| Manage venues | Yes | No | No |
| Cancel events (any team) | Yes | No | No |
| Cancel events (own teams) | Yes | Yes | No |

## Notification Triggers

| Event Action | Recipients | Notification Type |
|-------------|-----------|-------------------|
| Event created | All coaches + parents on team | event_created |
| Event time or venue changed | All coaches + parents on team | event_updated |
| Event cancelled | All coaches + parents on team | event_cancelled |

Notifications are created as rows when the triggering action occurs via server actions. Delivery is in-app only for this phase. Push notifications and email are future additions — the trigger logic and data model stay the same.

## What's NOT in This Phase

- Voice-driven schedule changes (future — builds on top of this)
- Push notifications / email delivery (future — notification records are created now)
- Google Maps integration for venues (future — addresses stored now)
- Drag-and-drop rescheduling in calendar view
- Month view in calendar (weekly grid only)
- Multi-team events (an event belongs to one team)
- Opponent tracking for games
- Attendance tracking

## File Structure

```
app-next/app/dashboard/schedule/
├── page.tsx                    # Main schedule page (agenda + calendar toggle)
├── agenda-view.tsx             # Agenda/list view component
├── calendar-view.tsx           # Weekly calendar grid component
├── event-card.tsx              # Single event card for agenda view
├── event-modal.tsx             # Add/edit event modal
├── actions.ts                  # Server actions (CRUD events, generate recurring, create notifications)
└── filters.tsx                 # Team/type filter controls

app-next/app/dashboard/settings/
└── venues-section.tsx          # Venue CRUD client component added to settings page

app-next/components/
├── notification-bell.tsx       # Bell icon + dropdown (client component)
└── sidebar.tsx                 # (existing — add notification bell)

supabase/migrations/
└── 006_scheduling.sql          # venues, events, notifications tables, triggers, indexes, RLS
```
