# Auto-Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a coach can't attend, automatically find the best available replacement coach and assign them — no DOC intervention needed.

**Architecture:** Add an `autoAssignCoverage` function that runs inside `createCoverageRequest` after creating the request. It finds all club coaches, filters out those with conflicting events, ranks by team familiarity and recent coverage load, then auto-assigns the top match. If no one is available, escalates to DOC immediately. Also add conflict checking to the DOC's manual `assignCoverage` flow.

**Tech Stack:** Supabase (existing), Next.js server actions (existing)

---

## File Structure

| File | Responsibility |
|------|---------------|
| `app/dashboard/coverage/auto-assign.ts` | Auto-assignment logic — find available coaches, rank, assign |
| `app/dashboard/coverage/actions.ts` | Modify — call autoAssignCoverage after creating request, add conflict check to assignCoverage |
| `app/dashboard/coverage/request-card.tsx` | Verify — confirm covering coach name displays for accepted requests |

---

### Task 1: Auto-assignment logic

**Files:**
- Create: `app-next/app/dashboard/coverage/auto-assign.ts`

- [ ] **Step 1: Create the auto-assign module**

```typescript
import { createServiceClient } from '@/lib/supabase/service'

interface RankedCoach {
  profileId: string
  displayName: string
  score: number
}

export async function autoAssignCoverage(
  requestId: string,
  eventId: string,
  clubId: string,
  unavailableCoachId: string
): Promise<{ assigned: boolean; coachName?: string }> {
  const service = createServiceClient()

  // Get event details
  const { data: event } = await service
    .from('events')
    .select('title, start_time, end_time, team_id')
    .eq('id', eventId)
    .single()

  if (!event) return { assigned: false }

  // Get all coaches in the club except the unavailable one
  const { data: allCoaches } = await service
    .from('profiles')
    .select('id, display_name')
    .eq('club_id', clubId)
    .eq('role', 'coach')
    .neq('id', unavailableCoachId)

  if (!allCoaches || allCoaches.length === 0) return { assigned: false }

  // Find coaches with conflicting events at the same time (exclude the event being covered)
  const { data: conflictingEvents } = await service
    .from('events')
    .select('team_id')
    .eq('club_id', clubId)
    .eq('status', 'scheduled')
    .neq('id', eventId)
    .lt('start_time', event.end_time)
    .gt('end_time', event.start_time)

  const busyTeamIds = (conflictingEvents ?? []).map(e => e.team_id)

  // Find which coaches are on those busy teams
  const busyCoachIds = new Set<string>()
  if (busyTeamIds.length > 0) {
    const { data: busyMembers } = await service
      .from('team_members')
      .select('profile_id')
      .in('team_id', busyTeamIds)
      .eq('role', 'coach')

    for (const m of busyMembers ?? []) {
      busyCoachIds.add(m.profile_id)
    }
  }

  // Filter to available coaches
  const availableCoaches = allCoaches.filter(c => !busyCoachIds.has(c.id))

  if (availableCoaches.length === 0) return { assigned: false }

  // Rank coaches
  // 1. Coaches on the same team get +10 points (they know the players)
  // 2. Fewer recent coverage assignments = higher score (spread the load)
  const { data: teamMembers } = await service
    .from('team_members')
    .select('profile_id')
    .eq('team_id', event.team_id)
    .eq('role', 'coach')

  const sameTeamCoachIds = new Set((teamMembers ?? []).map(m => m.profile_id))

  // Count recent coverage assignments (last 30 days)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
  const { data: recentCoverage } = await service
    .from('coverage_requests')
    .select('covering_coach_id')
    .eq('club_id', clubId)
    .in('status', ['accepted', 'resolved'])
    .gte('created_at', thirtyDaysAgo)
    .not('covering_coach_id', 'is', null)

  const coverageCount: Record<string, number> = {}
  for (const r of recentCoverage ?? []) {
    if (r.covering_coach_id) {
      coverageCount[r.covering_coach_id] = (coverageCount[r.covering_coach_id] ?? 0) + 1
    }
  }

  const ranked: RankedCoach[] = availableCoaches.map(c => {
    let score = 0
    // Same team bonus
    if (sameTeamCoachIds.has(c.id)) score += 10
    // Fewer recent coverages = higher score (max 5 bonus points)
    const count = coverageCount[c.id] ?? 0
    score += Math.max(0, 5 - count)
    return { profileId: c.id, displayName: c.display_name, score }
  })

  // Sort by score descending
  ranked.sort((a, b) => b.score - a.score)

  const bestMatch = ranked[0]

  // Auto-assign
  const { error } = await service
    .from('coverage_requests')
    .update({
      status: 'accepted',
      covering_coach_id: bestMatch.profileId,
    })
    .eq('id', requestId)
    .eq('status', 'pending')

  if (error) return { assigned: false }

  // Log the auto-accept response
  await service.from('coverage_responses').insert({
    coverage_request_id: requestId,
    coach_id: bestMatch.profileId,
    response: 'accepted',
  })

  return { assigned: true, coachName: bestMatch.displayName }
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/canci27/Desktop/sidelineos && git add app-next/app/dashboard/coverage/auto-assign.ts
git commit -m "feat: add auto-coverage assignment logic — find best available coach"
```

---

### Task 2: Integrate auto-assign into createCoverageRequest

**Files:**
- Modify: `app-next/app/dashboard/coverage/actions.ts`

- [ ] **Step 1: Read actions.ts and find createCoverageRequest**

- [ ] **Step 2: Add auto-assign call after request creation**

Import at the top of the file:
```typescript
import { autoAssignCoverage } from './auto-assign'
```

In `createCoverageRequest`, after the insert succeeds (after line `if (error) throw ...`), **remove the existing `notifyClubCoaches` call** (lines 131-137) and the `revalidatePath` calls. Replace everything from after the insert error check through the end of the function with:

```typescript
  // Get the created request ID
  // Change the insert to return the id:
  // .select('id').single()

  // Then after insert:
  const result = await autoAssignCoverage(
    request.id,
    eventId,
    profile.club_id!,
    unavailableCoachId
  )

  if (result.assigned) {
    // Auto-assigned! Notify everyone
    const message = `${result.coachName} has been auto-assigned to cover ${event.title} on ${dateStr} at ${timeStr}`

    // Notify the assigned coach
    const { data: assignedRequest } = await supabase
      .from('coverage_requests')
      .select('covering_coach_id')
      .eq('id', request.id)
      .single()

    const docId = await getDocProfileId(profile.club_id!)
    const notifyIds = [unavailableCoachId]
    if (assignedRequest?.covering_coach_id) notifyIds.push(assignedRequest.covering_coach_id)
    if (docId) notifyIds.push(docId)

    await notifySpecificProfiles(eventId, notifyIds, 'coverage_accepted', message)
  } else {
    // No one available — broadcast to coaches and escalate to DOC immediately
    await notifyClubCoaches(
      eventId,
      profile.club_id!,
      unavailableCoachId,
      'coverage_requested',
      `Can you cover ${event.title} on ${dateStr} at ${timeStr}? (No auto-match found)`
    )

    // Escalate to DOC immediately
    const docId = await getDocProfileId(profile.club_id!)
    if (docId) {
      await notifySpecificProfiles(
        eventId,
        [docId],
        'coverage_escalated',
        `No available coach found for ${event.title} on ${dateStr} — please assign manually`
      )
    }
  }
```

The key change to the insert: add `.select('id').single()` and store the result:

Change:
```typescript
const { error } = await supabase
  .from('coverage_requests')
  .insert({ ... })
```

To:
```typescript
const { data: request, error } = await supabase
  .from('coverage_requests')
  .insert({ ... })
  .select('id')
  .single()
```

- [ ] **Step 3: Commit**

```bash
cd /Users/canci27/Desktop/sidelineos && git add app-next/app/dashboard/coverage/actions.ts
git commit -m "feat: auto-assign coverage when coach can't attend — escalate if no match"
```

---

### Task 3: Add conflict check to manual assignCoverage

**Files:**
- Modify: `app-next/app/dashboard/coverage/actions.ts`

- [ ] **Step 1: Add conflict check before DOC manual assignment**

In the `assignCoverage` function, before the update query, add a check that the assigned coach isn't already busy:

```typescript
  // Check if the assigned coach has a conflicting event
  const { data: requestInfo } = await supabase
    .from('coverage_requests')
    .select('event_id')
    .eq('id', requestId)
    .single()

  if (requestInfo) {
    const { data: event } = await supabase
      .from('events')
      .select('start_time, end_time, club_id')
      .eq('id', requestInfo.event_id)
      .single()

    if (event) {
      // Check if this coach's teams have events at the same time
      const { data: coachTeams } = await supabase
        .from('team_members')
        .select('team_id')
        .eq('profile_id', coachProfileId)
        .eq('role', 'coach')

      if (coachTeams && coachTeams.length > 0) {
        const teamIds = coachTeams.map(t => t.team_id)
        const { data: conflicts } = await supabase
          .from('events')
          .select('id, title')
          .eq('club_id', event.club_id)
          .in('team_id', teamIds)
          .eq('status', 'scheduled')
          .lt('start_time', event.end_time)
          .gt('end_time', event.start_time)

        if (conflicts && conflicts.length > 0) {
          throw new Error(`${conflicts[0].title} conflicts — this coach is already busy at that time.`)
        }
      }
    }
  }
```

Add this before the existing `const { data: request, error } = await supabase.from('coverage_requests').update(...)` call.

- [ ] **Step 2: Commit**

```bash
cd /Users/canci27/Desktop/sidelineos && git add app-next/app/dashboard/coverage/actions.ts
git commit -m "feat: add conflict check to manual coverage assignment"
```

---

### Task 4: Show auto-assigned badge in coverage UI

**Files:**
- Modify: `app-next/app/dashboard/coverage/request-card.tsx`

- [ ] **Step 1: Read request-card.tsx**

Understand how the coverage request cards are rendered — find where the status badges are displayed.

- [ ] **Step 2: Add "Auto-assigned" indicator**

The existing UI already shows "Covered by [coach name]" for accepted requests. Since auto-assigned and manually accepted look the same to the end user (a coach is covering), no UI distinction is needed. 

Just verify that the existing request-card.tsx properly displays the covering coach name for `accepted` status. If it does, no changes are needed — skip this task.

- [ ] **Step 3: Commit**

```bash
cd /Users/canci27/Desktop/sidelineos && git add app-next/app/dashboard/coverage/request-card.tsx
git commit -m "feat: show auto-assigned indicator on coverage cards"
```

---

### Task 5: End-to-end test

- [ ] **Step 1: Verify dev server is running**

Navigate to `http://localhost:3000/dashboard/schedule`

- [ ] **Step 2: Test auto-assignment**

Find an event where a coach is assigned. Click "Can't Attend" on that event. Confirm:
- Coverage request is created
- System auto-finds an available coach
- Notification appears saying "[Coach] has been auto-assigned to cover [event]"
- The coverage page shows the request as "accepted"

- [ ] **Step 3: Test no-match escalation**

If all other coaches have conflicting events, confirm:
- Request is created
- System broadcasts to all coaches (fallback)
- DOC gets an immediate escalation notification
- Coverage page shows the request as "pending" with escalation

- [ ] **Step 4: Test manual assignment conflict check**

As DOC, try to manually assign a coach who has a conflicting event. Confirm an error message appears.

- [ ] **Step 5: Final commit**

```bash
cd /Users/canci27/Desktop/sidelineos && git add -A
git commit -m "feat: auto-coverage — smart coach replacement with conflict detection"
```
