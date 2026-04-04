# SidelineOS Coach Coverage — Design Spec

## Overview

The coach coverage system handles the chaos when a coach can't make an event. Instead of the DOC scrambling to text everyone, the system automatically broadcasts a coverage request to all club coaches, tracks responses, and escalates to the DOC if no one accepts within a configurable timeout.

## Approach

**Separate coverage system.** A `coverage_requests` table tracks the workflow lifecycle (pending → accepted/escalated → resolved) linked to events. A `coverage_responses` table provides an audit trail of who was asked and who responded. This keeps the events table clean and gives the DOC full visibility into coverage history.

## Database Schema

### `club_settings`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | default gen_random_uuid() |
| club_id | uuid FK → clubs.id ON DELETE CASCADE | UNIQUE — one row per club |
| coverage_timeout_minutes | integer NOT NULL DEFAULT 120 | How long to wait before escalating to DOC |
| created_at | timestamptz NOT NULL | default now() |
| updated_at | timestamptz NOT NULL | default now() |

**Triggers:**
- `club_settings_updated_at BEFORE UPDATE` — reuses existing `update_updated_at()` function

### `coverage_requests`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | default gen_random_uuid() |
| event_id | uuid FK → events.id ON DELETE CASCADE | The event needing coverage |
| club_id | uuid FK → clubs.id ON DELETE CASCADE | For RLS scoping |
| unavailable_coach_id | uuid FK → profiles.id ON DELETE CASCADE | Coach who can't make it |
| covering_coach_id | uuid FK → profiles.id ON DELETE SET NULL | nullable — coach who accepted or was assigned |
| status | text NOT NULL DEFAULT 'pending' | CHECK (status IN ('pending', 'accepted', 'escalated', 'resolved')) |
| created_by | uuid NOT NULL FK → auth.users(id) | Who initiated (coach self-report or DOC) |
| timeout_at | timestamptz NOT NULL | When to escalate if no one accepts |
| created_at | timestamptz NOT NULL | default now() |
| updated_at | timestamptz NOT NULL | default now() |

**Triggers:**
- `coverage_requests_updated_at BEFORE UPDATE` — reuses existing `update_updated_at()` function

**Indexes:**
- coverage_requests(event_id)
- coverage_requests(club_id)
- coverage_requests(status) WHERE status IN ('pending', 'escalated')
- coverage_requests(timeout_at) WHERE status = 'pending'

### `coverage_responses`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | default gen_random_uuid() |
| coverage_request_id | uuid FK → coverage_requests.id ON DELETE CASCADE | |
| coach_id | uuid FK → profiles.id ON DELETE CASCADE | Coach who responded |
| response | text NOT NULL | CHECK (response IN ('accepted', 'declined')) |
| created_at | timestamptz NOT NULL | default now() |

**Indexes:**
- coverage_responses(coverage_request_id)
- coverage_responses(coach_id)

**Constraints:**
- UNIQUE(coverage_request_id, coach_id) — one response per coach per request

## Row-Level Security

All policies MUST use the existing `SECURITY DEFINER` helper functions to avoid RLS recursion.

### `club_settings`

```sql
-- DOC: full CRUD
CREATE POLICY club_settings_doc_all ON club_settings FOR ALL
  USING (club_id IN (SELECT get_doc_club_ids()))
  WITH CHECK (club_id IN (SELECT get_doc_club_ids()));

-- All club members: read
CREATE POLICY club_settings_member_read ON club_settings FOR SELECT
  USING (club_id IN (SELECT get_user_club_ids()));
```

### `coverage_requests`

```sql
-- DOC: full CRUD for their club
CREATE POLICY coverage_requests_doc_all ON coverage_requests FOR ALL
  USING (club_id IN (SELECT get_doc_club_ids()))
  WITH CHECK (club_id IN (SELECT get_doc_club_ids()));

-- Coaches: read all requests in their club
CREATE POLICY coverage_requests_coach_read ON coverage_requests FOR SELECT
  USING (club_id IN (SELECT get_user_club_ids()));

-- Coaches: insert (self-report unavailability)
CREATE POLICY coverage_requests_coach_insert ON coverage_requests FOR INSERT
  WITH CHECK (
    club_id IN (SELECT get_user_club_ids())
    AND unavailable_coach_id IN (SELECT get_user_profile_ids())
  );
```

### `coverage_responses`

```sql
-- DOC: read all responses in their club
CREATE POLICY coverage_responses_doc_read ON coverage_responses FOR SELECT
  USING (coverage_request_id IN (
    SELECT id FROM coverage_requests WHERE club_id IN (SELECT get_doc_club_ids())
  ));

-- Coaches: read all responses in their club
CREATE POLICY coverage_responses_coach_read ON coverage_responses FOR SELECT
  USING (coverage_request_id IN (
    SELECT id FROM coverage_requests WHERE club_id IN (SELECT get_user_club_ids())
  ));

-- Coaches: insert their own response
CREATE POLICY coverage_responses_coach_insert ON coverage_responses FOR INSERT
  WITH CHECK (coach_id IN (SELECT get_user_profile_ids()));
```

## Coverage Flow

1. **Coach marks unavailable** — Coach taps "Can't Attend" on an event, or DOC marks a coach unavailable
2. **Request created** — `coverage_requests` row with status `pending`, `timeout_at` = now + club's timeout setting
3. **Broadcast** — All other coaches in the club get notified: "Can you cover [Event Title] on [Date] at [Time]?"
4. **Coach accepts** — `status` → `accepted`, `covering_coach_id` set, `coverage_responses` row with `accepted`. DOC, unavailable coach, and parents on the team are notified: "Coach Y is covering [Event Title]"
5. **Coach declines** — `coverage_responses` row with `declined`. Request stays `pending`.
6. **Timeout** — If `timeout_at` passes with no acceptance, `status` → `escalated`. DOC gets escalation notification.
7. **DOC assigns** — DOC picks a coach from coverage dashboard. `status` → `resolved`, `covering_coach_id` set. Same notifications as acceptance.

**Timeout checking:** Lazy evaluation on page load. When schedule page or coverage dashboard loads, query for requests where `timeout_at < now() AND status = 'pending'` and flip to `escalated`. No background job needed.

## Notification Types

Uses the existing `notifications` table. New notification types to add to the CHECK constraint:

| Type | Recipients | Message |
|------|-----------|---------|
| `coverage_requested` | All club coaches (except unavailable one) | "Can you cover [Event Title] on [Date] at [Time]?" |
| `coverage_accepted` | DOC + unavailable coach + parents on team | "[Coach Name] is covering [Event Title] on [Date]" |
| `coverage_escalated` | DOC only | "No one accepted coverage for [Event Title] on [Date] — assign manually" |

**Migration needed:** ALTER the `notifications.type` CHECK constraint to add these three values.

## Pages & UI

### Event Cards — "Can't Attend" / Coverage Badges

On existing event cards in the schedule page:
- **Coaches** see a "Can't Attend" button on events for teams they belong to
- **DOC** sees a "Mark Unavailable" dropdown to select which coach is out
- Events with active coverage show badges:
  - Orange: "Needs Coverage" (pending)
  - Red: "Escalated" (past timeout, no one accepted)
  - Green: "Covered by [Name]" (accepted/resolved)

### `/dashboard/coverage` — Coverage Dashboard (DOC only)

Three sections:

**Escalated (top, highlighted):**
- Red-bordered cards for requests past timeout with no coverage
- Each shows: event details, who's unavailable, response summary (X declined, Y didn't respond)
- "Assign Coach" dropdown → picks from all club coaches

**Active Requests:**
- Orange-bordered cards for pending requests
- Shows: event details, who's unavailable, countdown to escalation, response summary
- "Assign Coach" dropdown as manual override

**Recently Resolved:**
- Green-bordered cards for recently handled coverage (last 7 days)
- Shows: event, who was unavailable, who covered, how it was resolved (accepted vs DOC-assigned)

### Notification Actions

When a coach receives a `coverage_requested` notification, clicking it navigates to the schedule page where the event is highlighted with Accept / Decline buttons inline on the event card.

### Settings — Coverage Timeout

New "Coverage" section in the settings page (DOC only):
- "Escalation timeout" — number input in minutes, default 120
- Simple save button

### Sidebar

Add "Coverage" nav item between Schedule and Coaches (DOC only). Shows a badge count of escalated + pending requests.

## Access Control

| Action | DOC | Coach | Parent |
|--------|-----|-------|--------|
| Mark self unavailable | N/A | Yes (own events) | No |
| Mark a coach unavailable | Yes | No | No |
| Accept coverage request | No | Yes | No |
| Decline coverage request | No | Yes | No |
| Manually assign coverage | Yes | No | No |
| View coverage dashboard | Yes | No | No |
| Configure timeout | Yes | No | No |
| See coverage badges on events | Yes | Yes | Yes (read-only) |

## What's NOT in This Phase

- Recurring availability patterns ("I'm never available Tuesdays")
- Preferred backup coaches per team
- Age-range matching for eligible coaches
- Auto-assignment (system picks coach automatically)
- Push notifications / email for coverage requests (in-app only, same as scheduling)
- Coverage analytics / reports

## File Structure

```
supabase/migrations/
└── 007_coach_coverage.sql                    # club_settings, coverage_requests, coverage_responses + RLS

app-next/app/dashboard/coverage/
├── page.tsx                                   # Coverage dashboard (DOC only, server component)
├── coverage-client.tsx                        # Client wrapper with sections
├── request-card.tsx                           # Single coverage request card
├── assign-modal.tsx                           # DOC manual assignment modal
└── actions.ts                                 # Server actions (create request, accept, decline, assign, check timeouts)

app-next/app/dashboard/schedule/
├── event-card.tsx                             # (modify) Add coverage badges + Can't Attend button
├── cant-attend-modal.tsx                      # Modal for DOC to pick which coach is unavailable
├── coverage-actions-inline.tsx                # Accept/Decline buttons shown on events needing coverage
└── actions.ts                                 # (modify) Add coverage-related queries to getScheduleData

app-next/app/dashboard/settings/
├── page.tsx                                   # (modify) Add coverage timeout section
└── coverage-settings.tsx                      # Coverage timeout config component

app-next/components/
└── sidebar.tsx                                # (modify) Add Coverage nav item with badge count
```
