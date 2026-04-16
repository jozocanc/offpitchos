# Coach Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a coach coverage system where coaches can mark themselves unavailable, the system broadcasts coverage requests to other coaches, and the DOC can manually assign if no one accepts.

**Architecture:** Separate `coverage_requests` and `coverage_responses` tables track the full coverage workflow. Lazy timeout evaluation on page load (no cron). Coverage state shown as badges on event cards. DOC gets a dedicated coverage dashboard.

**Tech Stack:** Next.js 14, Supabase (Postgres + RLS), Tailwind CSS 4, TypeScript. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-04-04-coach-coverage-design.md`

**Note:** No test framework configured. Steps focus on manual verification via dev server and build checks.

---

## File Structure

```
# New files
supabase/migrations/007_coach_coverage.sql                    — club_settings, coverage_requests, coverage_responses + RLS + notification type update
app-next/lib/supabase/service.ts                               — (already exists)
app-next/app/dashboard/coverage/page.tsx                       — Coverage dashboard (DOC only, server component)
app-next/app/dashboard/coverage/coverage-client.tsx            — Client wrapper with sections
app-next/app/dashboard/coverage/request-card.tsx               — Single coverage request card
app-next/app/dashboard/coverage/assign-modal.tsx               — DOC manual assignment modal
app-next/app/dashboard/coverage/actions.ts                     — Server actions for coverage
app-next/app/dashboard/schedule/cant-attend-modal.tsx          — Modal for DOC to pick unavailable coach
app-next/app/dashboard/schedule/coverage-actions-inline.tsx    — Accept/Decline buttons on event cards
app-next/app/dashboard/settings/coverage-settings.tsx          — Coverage timeout config

# Modified files
app-next/lib/constants.ts                                      — Add coverage constants
app-next/app/dashboard/schedule/event-card.tsx                 — Add coverage badges + Can't Attend button
app-next/app/dashboard/schedule/schedule-client.tsx            — Pass coverage data, handle coverage actions
app-next/app/dashboard/schedule/actions.ts                     — Add coverage queries to getScheduleData
app-next/app/dashboard/settings/page.tsx                       — Add CoverageSettings section
app-next/components/sidebar.tsx                                — Add Coverage nav item
app-next/app/dashboard/page.tsx                                — Wire up Coverage Alerts stat card
```

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/007_coach_coverage.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- ============================================================
-- 007_coach_coverage.sql — club_settings, coverage_requests, coverage_responses
-- ============================================================

-- --------------------------------------------------------
-- TABLES
-- --------------------------------------------------------

CREATE TABLE club_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL UNIQUE REFERENCES clubs(id) ON DELETE CASCADE,
  coverage_timeout_minutes integer NOT NULL DEFAULT 120,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE coverage_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  unavailable_coach_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  covering_coach_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'escalated', 'resolved')),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  timeout_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE coverage_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coverage_request_id uuid NOT NULL REFERENCES coverage_requests(id) ON DELETE CASCADE,
  coach_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  response text NOT NULL CHECK (response IN ('accepted', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(coverage_request_id, coach_id)
);

-- --------------------------------------------------------
-- INDEXES
-- --------------------------------------------------------

CREATE INDEX idx_coverage_requests_event_id ON coverage_requests(event_id);
CREATE INDEX idx_coverage_requests_club_id ON coverage_requests(club_id);
CREATE INDEX idx_coverage_requests_active ON coverage_requests(status) WHERE status IN ('pending', 'escalated');
CREATE INDEX idx_coverage_requests_timeout ON coverage_requests(timeout_at) WHERE status = 'pending';
CREATE INDEX idx_coverage_responses_request ON coverage_responses(coverage_request_id);
CREATE INDEX idx_coverage_responses_coach ON coverage_responses(coach_id);

-- Prevent duplicate active coverage requests per coach per event
CREATE UNIQUE INDEX idx_coverage_requests_no_dup
  ON coverage_requests(event_id, unavailable_coach_id)
  WHERE status IN ('pending', 'escalated');

-- --------------------------------------------------------
-- TRIGGERS
-- --------------------------------------------------------

CREATE TRIGGER club_settings_updated_at
  BEFORE UPDATE ON club_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER coverage_requests_updated_at
  BEFORE UPDATE ON coverage_requests
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- --------------------------------------------------------
-- UPDATE NOTIFICATIONS TYPE CONSTRAINT
-- --------------------------------------------------------

ALTER TABLE notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'event_created', 'event_updated', 'event_cancelled',
    'coverage_requested', 'coverage_accepted', 'coverage_escalated'
  ));

-- --------------------------------------------------------
-- RLS
-- --------------------------------------------------------

ALTER TABLE club_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE coverage_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE coverage_responses ENABLE ROW LEVEL SECURITY;

-- club_settings: DOC full CRUD
CREATE POLICY club_settings_doc_all ON club_settings FOR ALL
  USING (club_id IN (SELECT get_doc_club_ids()))
  WITH CHECK (club_id IN (SELECT get_doc_club_ids()));

-- club_settings: all club members read
CREATE POLICY club_settings_member_read ON club_settings FOR SELECT
  USING (club_id IN (SELECT get_user_club_ids()));

-- coverage_requests: DOC full CRUD
CREATE POLICY coverage_requests_doc_all ON coverage_requests FOR ALL
  USING (club_id IN (SELECT get_doc_club_ids()))
  WITH CHECK (club_id IN (SELECT get_doc_club_ids()));

-- coverage_requests: coaches read all in their club
CREATE POLICY coverage_requests_coach_read ON coverage_requests FOR SELECT
  USING (club_id IN (SELECT get_user_club_ids()));

-- coverage_requests: coaches insert (self-report)
CREATE POLICY coverage_requests_coach_insert ON coverage_requests FOR INSERT
  WITH CHECK (
    club_id IN (SELECT get_user_club_ids())
    AND unavailable_coach_id IN (SELECT get_user_profile_ids())
  );

-- coverage_responses: DOC read all in their club
CREATE POLICY coverage_responses_doc_read ON coverage_responses FOR SELECT
  USING (coverage_request_id IN (
    SELECT id FROM coverage_requests WHERE club_id IN (SELECT get_doc_club_ids())
  ));

-- coverage_responses: coaches read all in their club
CREATE POLICY coverage_responses_coach_read ON coverage_responses FOR SELECT
  USING (coverage_request_id IN (
    SELECT id FROM coverage_requests WHERE club_id IN (SELECT get_user_club_ids())
  ));

-- coverage_responses: coaches insert their own (must be in same club)
CREATE POLICY coverage_responses_coach_insert ON coverage_responses FOR INSERT
  WITH CHECK (
    coach_id IN (SELECT get_user_profile_ids())
    AND coverage_request_id IN (
      SELECT id FROM coverage_requests WHERE club_id IN (SELECT get_user_club_ids())
    )
  );
```

- [ ] **Step 2: Apply the migration in Supabase SQL Editor**

Paste and run in Supabase Dashboard → SQL Editor. Verify "Success. No rows returned."

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/007_coach_coverage.sql
git commit -m "feat: add coach coverage schema — club_settings, coverage_requests, coverage_responses with RLS"
```

---

## Task 2: Constants

**Files:**
- Modify: `app-next/lib/constants.ts`

- [ ] **Step 1: Add coverage constants**

Add after the existing `DAYS_OF_WEEK` block:

```typescript
export const COVERAGE_STATUSES = ['pending', 'accepted', 'escalated', 'resolved'] as const
export type CoverageStatus = (typeof COVERAGE_STATUSES)[number]

export const COVERAGE_STATUS_LABELS: Record<CoverageStatus, string> = {
  pending: 'Needs Coverage',
  accepted: 'Covered',
  escalated: 'Escalated',
  resolved: 'Covered',
}

export const COVERAGE_RESPONSE_TYPES = ['accepted', 'declined'] as const
export type CoverageResponseType = (typeof COVERAGE_RESPONSE_TYPES)[number]
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/canci27/Desktop/offpitchos/app-next && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add app-next/lib/constants.ts
git commit -m "feat: add coverage status and response type constants"
```

---

## Task 3: Coverage Server Actions

**Files:**
- Create: `app-next/app/dashboard/coverage/actions.ts`

- [ ] **Step 1: Create coverage server actions**

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

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

async function getClubTimeoutMinutes(clubId: string): Promise<number> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('club_settings')
    .select('coverage_timeout_minutes')
    .eq('club_id', clubId)
    .single()

  return data?.coverage_timeout_minutes ?? 120
}

async function notifyClubCoaches(
  eventId: string,
  clubId: string,
  excludeProfileId: string,
  type: 'coverage_requested' | 'coverage_accepted' | 'coverage_escalated',
  message: string
) {
  const service = createServiceClient()

  const { data: coaches } = await service
    .from('profiles')
    .select('id')
    .eq('club_id', clubId)
    .eq('role', 'coach')
    .neq('id', excludeProfileId)

  if (!coaches || coaches.length === 0) return

  const notifications = coaches.map(c => ({
    profile_id: c.id,
    event_id: eventId,
    type,
    message,
  }))

  await service.from('notifications').insert(notifications)
}

async function notifySpecificProfiles(
  eventId: string,
  profileIds: string[],
  type: 'coverage_requested' | 'coverage_accepted' | 'coverage_escalated',
  message: string
) {
  if (profileIds.length === 0) return
  const service = createServiceClient()

  const notifications = profileIds.map(pid => ({
    profile_id: pid,
    event_id: eventId,
    type,
    message,
  }))

  await service.from('notifications').insert(notifications)
}

async function getDocProfileId(clubId: string): Promise<string | null> {
  const service = createServiceClient()
  const { data } = await service
    .from('profiles')
    .select('id')
    .eq('club_id', clubId)
    .eq('role', 'doc')
    .single()

  return data?.id ?? null
}

// ---------- Actions ----------

export async function createCoverageRequest(eventId: string, unavailableCoachId: string) {
  const { user, profile, supabase } = await getUserProfile()
  const timeoutMinutes = await getClubTimeoutMinutes(profile.club_id!)
  const timeoutAt = new Date(Date.now() + timeoutMinutes * 60 * 1000)

  // Get event details for notification message
  const { data: event } = await supabase
    .from('events')
    .select('title, start_time, team_id')
    .eq('id', eventId)
    .single()

  if (!event) throw new Error('Event not found')

  const { error } = await supabase
    .from('coverage_requests')
    .insert({
      event_id: eventId,
      club_id: profile.club_id!,
      unavailable_coach_id: unavailableCoachId,
      status: 'pending',
      created_by: user.id,
      timeout_at: timeoutAt.toISOString(),
    })

  if (error) throw new Error(`Failed to create coverage request: ${error.message}`)

  const dateStr = new Date(event.start_time).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric'
  })
  const timeStr = new Date(event.start_time).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true
  })

  await notifyClubCoaches(
    eventId,
    profile.club_id!,
    unavailableCoachId,
    'coverage_requested',
    `Can you cover ${event.title} on ${dateStr} at ${timeStr}?`
  )

  revalidatePath('/dashboard/schedule')
  revalidatePath('/dashboard/coverage')
  revalidatePath('/dashboard')
}

export async function acceptCoverage(requestId: string) {
  const { profile, supabase } = await getUserProfile()

  // Atomic update — only succeeds if still pending
  const { data: request, error } = await supabase
    .from('coverage_requests')
    .update({
      status: 'accepted',
      covering_coach_id: profile.id,
    })
    .eq('id', requestId)
    .eq('status', 'pending')
    .select('event_id, club_id, unavailable_coach_id')
    .single()

  if (error || !request) {
    throw new Error('This coverage request has already been taken or is no longer available.')
  }

  // Record response
  await supabase.from('coverage_responses').insert({
    coverage_request_id: requestId,
    coach_id: profile.id,
    response: 'accepted',
  })

  // Get event + coach details for notification
  const service = createServiceClient()
  const { data: event } = await service
    .from('events')
    .select('title, start_time, team_id')
    .eq('id', request.event_id)
    .single()

  const { data: coveringCoach } = await service
    .from('profiles')
    .select('display_name')
    .eq('id', profile.id)
    .single()

  const coachName = coveringCoach?.display_name ?? 'A coach'
  const message = `${coachName} is covering ${event?.title ?? 'an event'}`

  // Notify DOC
  const docId = await getDocProfileId(request.club_id)
  const notifyIds = [request.unavailable_coach_id]
  if (docId) notifyIds.push(docId)

  // Notify DOC + unavailable coach
  await notifySpecificProfiles(request.event_id, notifyIds, 'coverage_accepted', message)

  // Notify parents on the team
  if (event?.team_id) {
    const { data: parents } = await service
      .from('team_members')
      .select('profile_id, profiles!inner(role)')
      .eq('team_id', event.team_id)

    const parentIds = (parents ?? [])
      .filter((p: any) => p.profiles?.role === 'parent')
      .map((p: any) => p.profile_id)

    if (parentIds.length > 0) {
      await notifySpecificProfiles(request.event_id, parentIds, 'coverage_accepted', message)
    }
  }

  revalidatePath('/dashboard/schedule')
  revalidatePath('/dashboard/coverage')
  revalidatePath('/dashboard')
}

export async function declineCoverage(requestId: string) {
  const { profile, supabase } = await getUserProfile()

  await supabase.from('coverage_responses').insert({
    coverage_request_id: requestId,
    coach_id: profile.id,
    response: 'declined',
  })

  revalidatePath('/dashboard/coverage')
}

export async function assignCoverage(requestId: string, coachProfileId: string) {
  const { supabase } = await getUserProfile()

  const { data: request, error } = await supabase
    .from('coverage_requests')
    .update({
      status: 'resolved',
      covering_coach_id: coachProfileId,
    })
    .eq('id', requestId)
    .in('status', ['pending', 'escalated'])
    .select('event_id, club_id, unavailable_coach_id')
    .single()

  if (error || !request) throw new Error('Failed to assign coverage')

  const service = createServiceClient()
  const { data: event } = await service
    .from('events')
    .select('title, team_id')
    .eq('id', request.event_id)
    .single()

  const { data: assignedCoach } = await service
    .from('profiles')
    .select('display_name')
    .eq('id', coachProfileId)
    .single()

  const message = `${assignedCoach?.display_name ?? 'A coach'} is covering ${event?.title ?? 'an event'}`

  // Notify assigned coach + unavailable coach
  await notifySpecificProfiles(
    request.event_id,
    [coachProfileId, request.unavailable_coach_id],
    'coverage_accepted',
    message
  )

  revalidatePath('/dashboard/schedule')
  revalidatePath('/dashboard/coverage')
  revalidatePath('/dashboard')
}

export async function checkAndEscalateTimeouts() {
  const service = createServiceClient()

  const { data: expired } = await service
    .from('coverage_requests')
    .select('id, event_id, club_id')
    .eq('status', 'pending')
    .lt('timeout_at', new Date().toISOString())

  if (!expired || expired.length === 0) return

  for (const req of expired) {
    await service
      .from('coverage_requests')
      .update({ status: 'escalated' })
      .eq('id', req.id)

    const { data: event } = await service
      .from('events')
      .select('title')
      .eq('id', req.event_id)
      .single()

    const docId = await getDocProfileId(req.club_id)
    if (docId) {
      await notifySpecificProfiles(
        req.event_id,
        [docId],
        'coverage_escalated',
        `No one accepted coverage for ${event?.title ?? 'an event'} — assign manually`
      )
    }
  }
}

export async function getCoverageData() {
  const { profile, supabase } = await getUserProfile()

  // Check and escalate timeouts first
  await checkAndEscalateTimeouts()

  const { data: requests } = await supabase
    .from('coverage_requests')
    .select(`
      id, event_id, status, timeout_at, created_at,
      unavailable_coach_id, covering_coach_id,
      events ( title, start_time, end_time, team_id, teams ( name, age_group ) ),
      profiles!coverage_requests_unavailable_coach_id_fkey ( display_name ),
      covering:profiles!coverage_requests_covering_coach_id_fkey ( display_name )
    `)
    .eq('club_id', profile.club_id!)
    .order('created_at', { ascending: false })

  const { data: responses } = await supabase
    .from('coverage_responses')
    .select(`
      id, coverage_request_id, response, created_at,
      profiles ( display_name )
    `)

  // Get all coaches for assignment dropdown
  const { data: coaches } = await supabase
    .from('profiles')
    .select('id, display_name')
    .eq('club_id', profile.club_id!)
    .eq('role', 'coach')

  return {
    requests: requests ?? [],
    responses: responses ?? [],
    coaches: coaches ?? [],
    userRole: profile.role,
    userProfileId: profile.id,
  }
}

export async function updateCoverageTimeout(minutes: number) {
  const { profile, supabase } = await getUserProfile()

  if (minutes < 15 || minutes > 1440) throw new Error('Timeout must be between 15 minutes and 24 hours')

  // Upsert club_settings
  const { error } = await supabase
    .from('club_settings')
    .upsert({
      club_id: profile.club_id!,
      coverage_timeout_minutes: minutes,
    }, { onConflict: 'club_id' })

  if (error) throw new Error(`Failed to update timeout: ${error.message}`)

  revalidatePath('/dashboard/settings')
}

export async function getCoverageTimeout() {
  const { profile } = await getUserProfile()
  return getClubTimeoutMinutes(profile.club_id!)
}
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/canci27/Desktop/offpitchos/app-next && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add app-next/app/dashboard/coverage/actions.ts
git commit -m "feat: add coverage server actions — create, accept, decline, assign, escalate"
```

---

## Task 4: Coverage Dashboard Page

**Files:**
- Create: `app-next/app/dashboard/coverage/page.tsx`
- Create: `app-next/app/dashboard/coverage/coverage-client.tsx`
- Create: `app-next/app/dashboard/coverage/request-card.tsx`
- Create: `app-next/app/dashboard/coverage/assign-modal.tsx`

- [ ] **Step 1: Create request-card component**

Create `app-next/app/dashboard/coverage/request-card.tsx`:

```typescript
'use client'

interface CoverageRequestCardProps {
  request: {
    id: string
    status: string
    timeout_at: string
    events: any
    profiles: any
    covering: any
  }
  responses: Array<{ coverage_request_id: string; response: string; profiles: any }>
  onAssign: (requestId: string) => void
}

export default function RequestCard({ request, responses, onAssign }: CoverageRequestCardProps) {
  const event = Array.isArray(request.events) ? request.events[0] : request.events
  const unavailableCoach = Array.isArray(request.profiles) ? request.profiles[0] : request.profiles
  const coveringCoach = Array.isArray(request.covering) ? request.covering[0] : request.covering
  const team = event?.teams ? (Array.isArray(event.teams) ? event.teams[0] : event.teams) : null

  const reqResponses = responses.filter(r => r.coverage_request_id === request.id)
  const acceptedCount = reqResponses.filter(r => r.response === 'accepted').length
  const declinedCount = reqResponses.filter(r => r.response === 'declined').length

  const isEscalated = request.status === 'escalated'
  const isPending = request.status === 'pending'
  const isCovered = request.status === 'accepted' || request.status === 'resolved'

  const timeoutDate = new Date(request.timeout_at)
  const now = new Date()
  const timeRemaining = Math.max(0, Math.floor((timeoutDate.getTime() - now.getTime()) / 60000))

  const borderColor = isEscalated ? 'border-red/30' : isPending ? 'border-yellow-500/30' : 'border-green/30'

  const dateStr = event?.start_time
    ? new Date(event.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : ''
  const timeStr = event?.start_time
    ? new Date(event.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
    : ''

  return (
    <div className={`bg-dark-secondary rounded-xl p-4 border ${borderColor} transition-colors`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {team && (
              <span className="text-xs font-bold bg-green/10 text-green px-2 py-0.5 rounded-full">
                {team.age_group}
              </span>
            )}
            {isEscalated && (
              <span className="text-xs font-bold bg-red/10 text-red px-2 py-0.5 rounded-full">
                Escalated
              </span>
            )}
            {isPending && (
              <span className="text-xs font-bold bg-yellow-500/10 text-yellow-500 px-2 py-0.5 rounded-full">
                Pending
              </span>
            )}
            {isCovered && (
              <span className="text-xs font-bold bg-green/10 text-green px-2 py-0.5 rounded-full">
                Covered
              </span>
            )}
          </div>
          <p className="font-bold text-white">{event?.title ?? 'Unknown event'}</p>
          <p className="text-gray text-sm mt-1">{dateStr} at {timeStr}</p>
          <p className="text-gray text-sm">
            Unavailable: <span className="text-white">{unavailableCoach?.display_name ?? 'Unknown'}</span>
          </p>
          {isCovered && coveringCoach && (
            <p className="text-green text-sm mt-1">
              Covered by: {coveringCoach.display_name}
            </p>
          )}
          <div className="flex gap-3 mt-2 text-xs text-gray">
            {declinedCount > 0 && <span>{declinedCount} declined</span>}
            {acceptedCount > 0 && <span>{acceptedCount} accepted</span>}
            {isPending && <span>{timeRemaining}m until escalation</span>}
          </div>
        </div>

        {(isPending || isEscalated) && (
          <button
            onClick={() => onAssign(request.id)}
            className="bg-green text-dark font-bold px-4 py-2 rounded-xl hover:opacity-90 transition-opacity text-sm shrink-0"
          >
            Assign
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create assign-modal component**

Create `app-next/app/dashboard/coverage/assign-modal.tsx`:

```typescript
'use client'

import { useState, useTransition } from 'react'
import { assignCoverage } from './actions'

interface Coach {
  id: string
  display_name: string | null
}

interface AssignModalProps {
  requestId: string
  coaches: Coach[]
  onClose: () => void
}

export default function AssignModal({ requestId, coaches, onClose }: AssignModalProps) {
  const [selectedCoach, setSelectedCoach] = useState(coaches[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleAssign() {
    if (!selectedCoach) {
      setError('Select a coach')
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        await assignCoverage(requestId, selectedCoach)
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-dark-secondary rounded-2xl p-8 w-full max-w-md border border-white/10 shadow-2xl">
        <h2 className="text-xl font-bold mb-6">Assign Coverage</h2>

        <label className="block text-sm font-medium text-gray mb-2">Select a coach</label>
        <select
          value={selectedCoach}
          onChange={e => setSelectedCoach(e.target.value)}
          className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-green transition-colors appearance-none mb-2"
        >
          {coaches.map(c => (
            <option key={c.id} value={c.id}>{c.display_name ?? 'Unknown'}</option>
          ))}
        </select>

        {error && <p className="text-red text-sm mt-2 mb-2">{error}</p>}

        <div className="flex gap-3 mt-6">
          <button
            onClick={onClose}
            className="flex-1 bg-dark border border-white/10 text-gray font-medium py-3 rounded-xl hover:text-white transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleAssign}
            disabled={isPending}
            className="flex-1 bg-green text-dark font-bold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isPending ? 'Assigning…' : 'Assign'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create coverage-client wrapper**

Create `app-next/app/dashboard/coverage/coverage-client.tsx`:

```typescript
'use client'

import { useState } from 'react'
import RequestCard from './request-card'
import AssignModal from './assign-modal'

interface CoverageClientProps {
  requests: any[]
  responses: any[]
  coaches: Array<{ id: string; display_name: string | null }>
}

export default function CoverageClient({ requests, responses, coaches }: CoverageClientProps) {
  const [assignRequestId, setAssignRequestId] = useState<string | null>(null)

  const escalated = requests.filter(r => r.status === 'escalated')
  const pending = requests.filter(r => r.status === 'pending')
  const resolved = requests.filter(r => r.status === 'accepted' || r.status === 'resolved')
    .slice(0, 10) // Last 10

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Coverage</h1>
          <p className="text-gray text-sm mt-1">
            {escalated.length + pending.length} active request{escalated.length + pending.length !== 1 ? 's' : ''}
          </p>
        </div>
      </div>

      {/* Escalated */}
      {escalated.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-bold text-red uppercase tracking-wider mb-3">
            Escalated — Needs Your Attention
          </h2>
          <div className="space-y-3">
            {escalated.map(req => (
              <RequestCard
                key={req.id}
                request={req}
                responses={responses}
                onAssign={setAssignRequestId}
              />
            ))}
          </div>
        </div>
      )}

      {/* Active */}
      {pending.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-bold text-yellow-500 uppercase tracking-wider mb-3">
            Active Requests
          </h2>
          <div className="space-y-3">
            {pending.map(req => (
              <RequestCard
                key={req.id}
                request={req}
                responses={responses}
                onAssign={setAssignRequestId}
              />
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {escalated.length === 0 && pending.length === 0 && (
        <div className="bg-dark-secondary rounded-2xl p-12 text-center border border-white/5 mb-8">
          <p className="text-gray text-lg">No active coverage requests.</p>
          <p className="text-gray text-sm mt-1">When a coach can&apos;t attend an event, it&apos;ll show up here.</p>
        </div>
      )}

      {/* Recently resolved */}
      {resolved.length > 0 && (
        <div>
          <h2 className="text-sm font-bold text-gray uppercase tracking-wider mb-3">
            Recently Resolved
          </h2>
          <div className="space-y-3">
            {resolved.map(req => (
              <RequestCard
                key={req.id}
                request={req}
                responses={responses}
                onAssign={setAssignRequestId}
              />
            ))}
          </div>
        </div>
      )}

      {/* Assign modal */}
      {assignRequestId && (
        <AssignModal
          requestId={assignRequestId}
          coaches={coaches}
          onClose={() => setAssignRequestId(null)}
        />
      )}
    </>
  )
}
```

- [ ] **Step 4: Create coverage page server component**

Create `app-next/app/dashboard/coverage/page.tsx`:

```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getCoverageData } from './actions'
import CoverageClient from './coverage-client'

export default async function CoveragePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', user.id)
    .single()

  // DOC only page
  if (profile?.role !== 'doc') {
    redirect('/dashboard')
  }

  const data = await getCoverageData()

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <CoverageClient
        requests={data.requests}
        responses={data.responses}
        coaches={data.coaches}
      />
    </div>
  )
}
```

- [ ] **Step 5: Verify build**

```bash
cd /Users/canci27/Desktop/offpitchos/app-next && npm run build
```

- [ ] **Step 6: Commit**

```bash
git add app-next/app/dashboard/coverage/
git commit -m "feat: add coverage dashboard page with request cards and assignment"
```

---

## Task 5: Schedule Page — Coverage Integration

**Files:**
- Create: `app-next/app/dashboard/schedule/cant-attend-modal.tsx`
- Create: `app-next/app/dashboard/schedule/coverage-actions-inline.tsx`
- Modify: `app-next/app/dashboard/schedule/actions.ts`
- Modify: `app-next/app/dashboard/schedule/event-card.tsx`
- Modify: `app-next/app/dashboard/schedule/schedule-client.tsx`

- [ ] **Step 1: Add coverage query to getScheduleData**

In `app-next/app/dashboard/schedule/actions.ts`, modify the `getScheduleData` function. Add this import at the top:

```typescript
import { checkAndEscalateTimeouts } from '../coverage/actions'
```

Then in `getScheduleData`, add after the venues query and before the return:

```typescript
  // Check coverage timeouts
  await checkAndEscalateTimeouts()

  // Get coverage requests for events
  const { data: coverageRequests } = await supabase
    .from('coverage_requests')
    .select('id, event_id, status, covering_coach_id, unavailable_coach_id, profiles!coverage_requests_covering_coach_id_fkey ( display_name )')
    .eq('club_id', profile.club_id!)
    .in('status', ['pending', 'accepted', 'escalated', 'resolved'])
```

Update the return statement to include:

```typescript
  return {
    events: events ?? [],
    teams: teams ?? [],
    venues: venues ?? [],
    coverageRequests: coverageRequests ?? [],
    userRole: profile.role,
    userProfileId: profile.id,
  }
```

- [ ] **Step 2: Create cant-attend-modal**

Create `app-next/app/dashboard/schedule/cant-attend-modal.tsx`:

```typescript
'use client'

import { useState, useTransition } from 'react'
import { createCoverageRequest } from '../coverage/actions'

interface Coach {
  id: string
  display_name: string | null
}

interface CantAttendModalProps {
  eventId: string
  coaches: Coach[]  // coaches on this team
  userProfileId: string
  userRole: string
  onClose: () => void
}

export default function CantAttendModal({ eventId, coaches, userProfileId, userRole, onClose }: CantAttendModalProps) {
  const isCoach = userRole === 'coach'
  const [selectedCoach, setSelectedCoach] = useState(isCoach ? userProfileId : coaches[0]?.id ?? '')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit() {
    if (!selectedCoach) {
      setError('Select a coach')
      return
    }
    setError(null)
    startTransition(async () => {
      try {
        await createCoverageRequest(eventId, selectedCoach)
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-dark-secondary rounded-2xl p-8 w-full max-w-md border border-white/10 shadow-2xl">
        <h2 className="text-xl font-bold mb-6">
          {isCoach ? "Can't Attend" : 'Mark Coach Unavailable'}
        </h2>

        {isCoach ? (
          <p className="text-gray text-sm mb-4">
            A coverage request will be sent to all other coaches in your club.
          </p>
        ) : (
          <>
            <label className="block text-sm font-medium text-gray mb-2">Which coach is unavailable?</label>
            <select
              value={selectedCoach}
              onChange={e => setSelectedCoach(e.target.value)}
              className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-green transition-colors appearance-none mb-2"
            >
              {coaches.map(c => (
                <option key={c.id} value={c.id}>{c.display_name ?? 'Unknown'}</option>
              ))}
            </select>
          </>
        )}

        {error && <p className="text-red text-sm mt-2 mb-2">{error}</p>}

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
            {isPending ? 'Sending…' : 'Send Request'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create coverage-actions-inline**

Create `app-next/app/dashboard/schedule/coverage-actions-inline.tsx`:

```typescript
'use client'

import { useTransition } from 'react'
import { acceptCoverage, declineCoverage } from '../coverage/actions'

interface CoverageActionsInlineProps {
  requestId: string
}

export default function CoverageActionsInline({ requestId }: CoverageActionsInlineProps) {
  const [isPending, startTransition] = useTransition()

  function handleAccept() {
    startTransition(async () => {
      try {
        await acceptCoverage(requestId)
      } catch (err) {
        alert(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  function handleDecline() {
    startTransition(async () => {
      await declineCoverage(requestId)
    })
  }

  return (
    <div className="flex gap-2 mt-2">
      <button
        onClick={handleAccept}
        disabled={isPending}
        className="bg-green text-dark font-bold px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity text-xs disabled:opacity-60"
      >
        {isPending ? '…' : 'Accept'}
      </button>
      <button
        onClick={handleDecline}
        disabled={isPending}
        className="bg-dark border border-white/10 text-gray font-medium px-3 py-1.5 rounded-lg hover:text-white transition-colors text-xs disabled:opacity-60"
      >
        Decline
      </button>
    </div>
  )
}
```

- [ ] **Step 4: Update event-card.tsx with coverage badges and actions**

Modify `app-next/app/dashboard/schedule/event-card.tsx`. The full updated component:

Add to the imports:
```typescript
import CoverageActionsInline from './coverage-actions-inline'
```

Update the interface to add coverage props:
```typescript
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
    teams: { name: string; age_group: string }[] | null
    venues: { name: string }[] | null
  }
  onEdit: (eventId: string) => void
  onCancel: (eventId: string) => void
  onCantAttend?: (eventId: string) => void
  canEdit: boolean
  userRole: string
  coverageRequest?: {
    id: string
    status: string
    covering_coach_id: string | null
    profiles: any
  } | null
  showCoverageActions?: boolean  // true if this coach can accept/decline
}
```

In the badges section (after the recurrence_group span), add:

```typescript
            {coverageRequest && coverageRequest.status === 'pending' && (
              <span className="text-xs font-bold bg-yellow-500/10 text-yellow-500 px-2 py-0.5 rounded-full">
                Needs Coverage
              </span>
            )}
            {coverageRequest && coverageRequest.status === 'escalated' && (
              <span className="text-xs font-bold bg-red/10 text-red px-2 py-0.5 rounded-full">
                Escalated
              </span>
            )}
            {coverageRequest && (coverageRequest.status === 'accepted' || coverageRequest.status === 'resolved') && (
              <span className="text-xs font-bold bg-green/10 text-green px-2 py-0.5 rounded-full">
                Covered{coverageRequest.profiles?.[0]?.display_name ? ` by ${coverageRequest.profiles[0].display_name}` : ''}
              </span>
            )}
```

In the action buttons section, add "Can't Attend" button and inline coverage actions:

After the existing Edit/Cancel buttons div, add:
```typescript
        {onCantAttend && !isCancelled && !coverageRequest && (
          <button
            onClick={() => onCantAttend(event.id)}
            className="text-yellow-500 hover:text-yellow-400 text-sm transition-colors shrink-0"
          >
            Can&apos;t Attend
          </button>
        )}
```

After the main flex div (before the closing `</div>` of the card), add:
```typescript
      {showCoverageActions && coverageRequest?.status === 'pending' && (
        <CoverageActionsInline requestId={coverageRequest.id} />
      )}
```

- [ ] **Step 5: Update schedule-client.tsx**

Modify `app-next/app/dashboard/schedule/schedule-client.tsx`:

Add import:
```typescript
import CantAttendModal from './cant-attend-modal'
```

Update the interface and props to include coverage data:

Add to `ScheduleClientProps`:
```typescript
  coverageRequests: Array<{
    id: string
    event_id: string
    status: string
    covering_coach_id: string | null
    unavailable_coach_id: string
    profiles: any
  }>
  userProfileId: string
```

Add state for can't attend modal:
```typescript
  const [cantAttendEventId, setCantAttendEventId] = useState<string | null>(null)
```

Add a helper to find coverage request for an event:
```typescript
  function getCoverageForEvent(eventId: string) {
    return coverageRequests.find(cr => cr.event_id === eventId) ?? null
  }

  function canShowCoverageActions(eventId: string) {
    const cr = getCoverageForEvent(eventId)
    if (!cr || cr.status !== 'pending') return false
    // Don't show accept/decline if this user is the unavailable coach
    return cr.unavailable_coach_id !== userProfileId && userRole === ROLES.COACH
  }
```

Pass new props to AgendaView's EventCard (this means AgendaView also needs updating — pass through the handlers).

For the modal, add before the EventModal:
```typescript
      {cantAttendEventId && (
        <CantAttendModal
          eventId={cantAttendEventId}
          coaches={[]}  // Will be populated from team members in a future enhancement
          userProfileId={userProfileId}
          userRole={userRole}
          onClose={() => setCantAttendEventId(null)}
        />
      )}
```

**Note:** The event-card, agenda-view, and calendar-view components need their props updated to pass through `onCantAttend`, `coverageRequest`, `showCoverageActions`, and `userRole`. Follow the same pattern as the existing `onEdit`/`onCancel` prop threading.

- [ ] **Step 6: Update agenda-view.tsx props**

Add new props to AgendaView and pass them through to EventCard:
- `onCantAttend`
- `coverageRequests` (the full array)
- `userRole`
- `userProfileId`

Map coverage requests to events in the render.

- [ ] **Step 7: Verify build**

```bash
cd /Users/canci27/Desktop/offpitchos/app-next && npm run build
```

- [ ] **Step 8: Commit**

```bash
git add app-next/app/dashboard/schedule/
git commit -m "feat: add coverage badges, can't attend button, and accept/decline to schedule"
```

---

## Task 6: Coverage Settings

**Files:**
- Create: `app-next/app/dashboard/settings/coverage-settings.tsx`
- Modify: `app-next/app/dashboard/settings/page.tsx`

- [ ] **Step 1: Create coverage settings component**

Create `app-next/app/dashboard/settings/coverage-settings.tsx`:

```typescript
'use client'

import { useState, useTransition, useEffect } from 'react'
import { getCoverageTimeout, updateCoverageTimeout } from '../coverage/actions'

export default function CoverageSettings() {
  const [minutes, setMinutes] = useState(120)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    getCoverageTimeout().then(setMinutes)
  }, [])

  function handleSave() {
    setError(null)
    setSaved(false)
    startTransition(async () => {
      try {
        await updateCoverageTimeout(minutes)
        setSaved(true)
        setTimeout(() => setSaved(false), 2000)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Something went wrong')
      }
    })
  }

  return (
    <section className="bg-dark-secondary rounded-2xl p-6 border border-white/5">
      <h2 className="text-lg font-bold mb-4">Coverage</h2>
      <div>
        <label className="block text-sm font-medium text-gray mb-2">
          Escalation timeout (minutes)
        </label>
        <p className="text-gray text-xs mb-3">
          How long to wait for a coach to accept before notifying you.
        </p>
        <div className="flex gap-3 items-center">
          <input
            type="number"
            value={minutes}
            onChange={e => setMinutes(Number(e.target.value))}
            min={15}
            max={1440}
            className="w-24 bg-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-green transition-colors"
          />
          <span className="text-gray text-sm">minutes</span>
          <button
            onClick={handleSave}
            disabled={isPending}
            className="bg-green text-dark font-bold px-4 py-2 rounded-xl hover:opacity-90 transition-opacity text-sm disabled:opacity-60"
          >
            {isPending ? 'Saving…' : saved ? 'Saved!' : 'Save'}
          </button>
        </div>
        {error && <p className="text-red text-sm mt-2">{error}</p>}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Add CoverageSettings to settings page**

In `app-next/app/dashboard/settings/page.tsx`:

Add import:
```typescript
import CoverageSettings from './coverage-settings'
```

Add `<CoverageSettings />` after `<VenuesSection />` and before the Notifications section. Only show for DOC role — wrap it:

```typescript
        {profile?.role === 'doc' && <CoverageSettings />}
```

Note: The settings page needs to fetch `role` from the profile query. Update the profile select from `'club_id, display_name'` to `'club_id, display_name, role'`.

- [ ] **Step 3: Verify build**

```bash
cd /Users/canci27/Desktop/offpitchos/app-next && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add app-next/app/dashboard/settings/coverage-settings.tsx app-next/app/dashboard/settings/page.tsx
git commit -m "feat: add coverage timeout settings for DOC"
```

---

## Task 7: Sidebar — Add Coverage Nav Item

**Files:**
- Modify: `app-next/components/sidebar.tsx`

- [ ] **Step 1: Add Coverage icon and nav item**

Add a CoverageIcon function after the existing icon functions:

```typescript
function CoverageIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="8.5" cy="7" r="4" />
      <polyline points="17 11 19 13 23 9" />
    </svg>
  )
}
```

Add the Coverage nav item to the `navItems` array, between Schedule and Coaches:

```typescript
  { label: 'Coverage', href: '/dashboard/coverage', icon: <CoverageIcon /> },
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/canci27/Desktop/offpitchos/app-next && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add app-next/components/sidebar.tsx
git commit -m "feat: add Coverage nav item to sidebar"
```

---

## Task 8: Dashboard — Coverage Alerts Stat Card

**Files:**
- Modify: `app-next/app/dashboard/page.tsx`

- [ ] **Step 1: Add coverage alerts query**

After the `todaySessions` query, add:

```typescript
  // Count active coverage requests (pending + escalated)
  const { count: coverageAlerts } = profile?.club_id
    ? await supabase
        .from('coverage_requests')
        .select('id', { count: 'exact', head: true })
        .eq('club_id', profile.club_id)
        .in('status', ['pending', 'escalated'])
    : { count: 0 }
```

- [ ] **Step 2: Update the Coverage Alerts stat card**

Replace the existing "Coverage Alerts" StatCard:

```typescript
        <StatCard
          label="Coverage Alerts"
          value={String(coverageAlerts ?? 0)}
          accent={(coverageAlerts ?? 0) > 0 ? 'green' : 'gray'}
        />
```

Remove the `note="Coming soon"` prop.

- [ ] **Step 3: Verify build**

```bash
cd /Users/canci27/Desktop/offpitchos/app-next && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add app-next/app/dashboard/page.tsx
git commit -m "feat: wire up coverage alerts stat card on dashboard"
```

---

## Task 9: Final Verification

- [ ] **Step 1: Run build**

```bash
cd /Users/canci27/Desktop/offpitchos/app-next && npm run build
```

Expected: Build succeeds with no errors. New `/dashboard/coverage` route appears.

- [ ] **Step 2: Full manual test flow**

1. Log in as DOC
2. Go to Settings → verify "Coverage" section with timeout config
3. Go to Schedule → verify events show no coverage badges (clean state)
4. On an event, click "Can't Attend" → select a coach → send request
5. Verify event shows orange "Needs Coverage" badge
6. Go to Coverage dashboard → verify the request appears in "Active Requests"
7. Coverage dashboard shows "Assign" button → assign a coach
8. Verify event badge changes to green "Covered by [Name]"
9. Check notification bell → coverage notifications appear
10. Check Dashboard → "Coverage Alerts" shows correct count
11. Verify Coverage link in sidebar works

- [ ] **Step 3: Commit any fixes**

If any issues found during testing, fix and commit with descriptive message.
