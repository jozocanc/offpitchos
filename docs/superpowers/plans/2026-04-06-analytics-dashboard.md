# Analytics Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an analytics page where DOCs see club-wide stats at a glance — attendance rates, revenue trends, coverage metrics, player growth, and team performance.

**Architecture:** A server action queries events, attendance, camp registrations, coverage requests, and players, then aggregates into stats. A client component renders stat cards, simple bar charts (pure CSS, no chart library), and team breakdowns.

**Tech Stack:** Supabase (existing), Next.js server actions, React client components, CSS-only charts

---

## File Structure

| File | Responsibility |
|------|---------------|
| `app/dashboard/analytics/actions.ts` | Server actions — aggregate all club stats |
| `app/dashboard/analytics/page.tsx` | Server component — render analytics page |
| `app/dashboard/analytics/analytics-client.tsx` | Client component — stat cards, charts, breakdowns |
| `components/sidebar.tsx` | Modify — add Analytics nav item for DOC |

---

### Task 1: Server actions — aggregate stats

**Files:**
- Create: `app-next/app/dashboard/analytics/actions.ts`

- [ ] **Step 1: Create the analytics actions**

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

export async function getAnalyticsData() {
  const { profile, supabase } = await getUserProfile()
  const clubId = profile.club_id!

  // --- Counts ---
  const { count: totalTeams } = await supabase
    .from('teams')
    .select('id', { count: 'exact', head: true })
    .eq('club_id', clubId)

  const { count: totalPlayers } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('club_id', clubId)

  const { count: totalCoaches } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('club_id', clubId)
    .eq('role', 'coach')

  const { count: totalParents } = await supabase
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('club_id', clubId)
    .eq('role', 'parent')

  // --- Events this month ---
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59)

  const { data: monthEvents } = await supabase
    .from('events')
    .select('id, type, status')
    .eq('club_id', clubId)
    .gte('start_time', monthStart.toISOString())
    .lte('start_time', monthEnd.toISOString())

  const eventsThisMonth = monthEvents?.length ?? 0
  const cancelledThisMonth = monthEvents?.filter(e => e.status === 'cancelled').length ?? 0

  // --- Attendance rate (last 30 days) ---
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

  const { data: recentEvents } = await supabase
    .from('events')
    .select('id')
    .eq('club_id', clubId)
    .eq('status', 'scheduled')
    .gte('start_time', thirtyDaysAgo.toISOString())
    .lte('start_time', now.toISOString())

  const recentEventIds = (recentEvents ?? []).map(e => e.id)
  let attendanceRate = 0
  let totalAttendance = 0
  let presentCount = 0

  if (recentEventIds.length > 0) {
    const { data: attendanceData } = await supabase
      .from('attendance')
      .select('status')
      .in('event_id', recentEventIds)

    totalAttendance = attendanceData?.length ?? 0
    presentCount = attendanceData?.filter(a => a.status === 'present' || a.status === 'late').length ?? 0
    attendanceRate = totalAttendance > 0 ? Math.round((presentCount / totalAttendance) * 100) : 0
  }

  // --- Coverage stats ---
  const { data: coverageData } = await supabase
    .from('coverage_requests')
    .select('id, status, created_at')
    .eq('club_id', clubId)

  const totalCoverageRequests = coverageData?.length ?? 0
  const acceptedCoverage = coverageData?.filter(c => c.status === 'accepted' || c.status === 'resolved').length ?? 0
  const coverageRate = totalCoverageRequests > 0 ? Math.round((acceptedCoverage / totalCoverageRequests) * 100) : 0
  const pendingCoverage = coverageData?.filter(c => c.status === 'pending' || c.status === 'escalated').length ?? 0

  // --- Camp revenue ---
  const { data: campDetails } = await supabase
    .from('camp_details')
    .select('id, fee_cents')
    .eq('club_id', clubId)

  let totalRevenue = 0
  let totalCollected = 0
  let totalCampRegistrations = 0

  if (campDetails && campDetails.length > 0) {
    const detailIds = campDetails.map(d => d.id)
    const { data: regs } = await supabase
      .from('camp_registrations')
      .select('camp_detail_id, payment_status')
      .in('camp_detail_id', detailIds)

    totalCampRegistrations = regs?.length ?? 0

    for (const reg of regs ?? []) {
      const detail = campDetails.find(d => d.id === reg.camp_detail_id)
      if (detail) {
        totalRevenue += detail.fee_cents
        if (reg.payment_status === 'paid') {
          totalCollected += detail.fee_cents
        }
      }
    }
  }

  // --- Team breakdown ---
  const { data: teams } = await supabase
    .from('teams')
    .select('id, name, age_group')
    .eq('club_id', clubId)
    .order('age_group', { ascending: true })

  const teamStats = []
  for (const team of teams ?? []) {
    const { count: playerCount } = await supabase
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', team.id)

    const { count: eventCount } = await supabase
      .from('events')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', team.id)
      .eq('status', 'scheduled')
      .gte('start_time', thirtyDaysAgo.toISOString())

    teamStats.push({
      name: team.name,
      ageGroup: team.age_group,
      players: playerCount ?? 0,
      eventsLast30: eventCount ?? 0,
    })
  }

  // --- Feedback count ---
  const { count: totalFeedback } = await supabase
    .from('player_feedback')
    .select('id', { count: 'exact', head: true })
    .eq('club_id', clubId)

  return {
    overview: {
      totalTeams: totalTeams ?? 0,
      totalPlayers: totalPlayers ?? 0,
      totalCoaches: totalCoaches ?? 0,
      totalParents: totalParents ?? 0,
    },
    activity: {
      eventsThisMonth,
      cancelledThisMonth,
      attendanceRate,
      totalAttendance,
      presentCount,
    },
    coverage: {
      totalRequests: totalCoverageRequests,
      coverageRate,
      pendingCoverage,
    },
    revenue: {
      totalRevenueCents: totalRevenue,
      totalCollectedCents: totalCollected,
      totalCampRegistrations,
    },
    teamStats,
    totalFeedback: totalFeedback ?? 0,
  }
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/canci27/Desktop/sidelineos && git add app-next/app/dashboard/analytics/actions.ts
git commit -m "feat: add analytics server actions with club-wide stat aggregation"
```

---

### Task 2: Analytics client component

**Files:**
- Create: `app-next/app/dashboard/analytics/analytics-client.tsx`

- [ ] **Step 1: Create the analytics client**

```tsx
'use client'

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
}

interface AnalyticsData {
  overview: {
    totalTeams: number
    totalPlayers: number
    totalCoaches: number
    totalParents: number
  }
  activity: {
    eventsThisMonth: number
    cancelledThisMonth: number
    attendanceRate: number
    totalAttendance: number
    presentCount: number
  }
  coverage: {
    totalRequests: number
    coverageRate: number
    pendingCoverage: number
  }
  revenue: {
    totalRevenueCents: number
    totalCollectedCents: number
    totalCampRegistrations: number
  }
  teamStats: {
    name: string
    ageGroup: string
    players: number
    eventsLast30: number
  }[]
  totalFeedback: number
}

export default function AnalyticsClient({ data }: { data: AnalyticsData }) {
  const { overview, activity, coverage, revenue, teamStats, totalFeedback } = data

  return (
    <div className="space-y-8">
      {/* Club Overview */}
      <section>
        <h2 className="text-lg font-bold text-white mb-4">Club Overview</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Teams" value={overview.totalTeams} />
          <StatCard label="Players" value={overview.totalPlayers} />
          <StatCard label="Coaches" value={overview.totalCoaches} />
          <StatCard label="Parents" value={overview.totalParents} />
        </div>
      </section>

      {/* Activity & Attendance */}
      <section>
        <h2 className="text-lg font-bold text-white mb-4">Activity (This Month)</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Events Scheduled" value={activity.eventsThisMonth} />
          <StatCard label="Cancelled" value={activity.cancelledThisMonth} color={activity.cancelledThisMonth > 0 ? 'red' : undefined} />
          <StatCard label="Attendance Rate" value={`${activity.attendanceRate}%`} color="green" />
          <StatCard label="Player Feedback" value={totalFeedback} />
        </div>
      </section>

      {/* Coverage */}
      <section>
        <h2 className="text-lg font-bold text-white mb-4">Coach Coverage</h2>
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Coverage Requests" value={coverage.totalRequests} />
          <StatCard label="Fill Rate" value={`${coverage.coverageRate}%`} color="green" />
          <StatCard label="Pending" value={coverage.pendingCoverage} color={coverage.pendingCoverage > 0 ? 'yellow' : undefined} />
        </div>
      </section>

      {/* Revenue */}
      <section>
        <h2 className="text-lg font-bold text-white mb-4">Camp Revenue</h2>
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Camp Registrations" value={revenue.totalCampRegistrations} />
          <StatCard label="Expected Revenue" value={formatCurrency(revenue.totalRevenueCents)} color="green" />
          <StatCard label="Collected" value={formatCurrency(revenue.totalCollectedCents)} />
        </div>
      </section>

      {/* Team Breakdown */}
      <section>
        <h2 className="text-lg font-bold text-white mb-4">Teams</h2>
        <div className="bg-dark-secondary border border-white/5 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left text-gray">
                <th className="px-5 py-3 font-medium">Team</th>
                <th className="px-5 py-3 font-medium">Age Group</th>
                <th className="px-5 py-3 font-medium">Players</th>
                <th className="px-5 py-3 font-medium">Events (30d)</th>
                <th className="px-5 py-3 font-medium">Activity</th>
              </tr>
            </thead>
            <tbody>
              {teamStats.map(team => {
                const maxEvents = Math.max(...teamStats.map(t => t.eventsLast30), 1)
                const barWidth = Math.round((team.eventsLast30 / maxEvents) * 100)
                return (
                  <tr key={team.name} className="border-b border-white/5 last:border-0">
                    <td className="px-5 py-3 text-white font-medium">{team.name}</td>
                    <td className="px-5 py-3 text-gray">{team.ageGroup}</td>
                    <td className="px-5 py-3 text-white">{team.players}</td>
                    <td className="px-5 py-3 text-white">{team.eventsLast30}</td>
                    <td className="px-5 py-3">
                      <div className="w-full bg-white/5 rounded-full h-2">
                        <div
                          className="bg-green h-2 rounded-full transition-all"
                          style={{ width: `${barWidth}%` }}
                        />
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: string | number; color?: 'green' | 'red' | 'yellow' }) {
  const colorClass = color === 'green' ? 'text-green' : color === 'red' ? 'text-red-400' : color === 'yellow' ? 'text-yellow-400' : 'text-white'

  return (
    <div className="bg-dark-secondary border border-white/5 rounded-xl p-5">
      <p className="text-sm text-gray mb-1">{label}</p>
      <p className={`text-3xl font-black ${colorClass}`}>{value}</p>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/canci27/Desktop/sidelineos && git add app-next/app/dashboard/analytics/analytics-client.tsx
git commit -m "feat: add analytics client with stat cards and team breakdown table"
```

---

### Task 3: Page + sidebar link

**Files:**
- Create: `app-next/app/dashboard/analytics/page.tsx`
- Modify: `app-next/components/sidebar.tsx`

- [ ] **Step 1: Create the page**

```tsx
import { Metadata } from 'next'
import { getAnalyticsData } from './actions'
import AnalyticsClient from './analytics-client'

export const metadata: Metadata = {
  title: 'Analytics',
}

export default async function AnalyticsPage() {
  const data = await getAnalyticsData()

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Analytics</h1>
        <p className="text-sm text-gray mt-1">Your club at a glance.</p>
      </div>

      <AnalyticsClient data={data} />
    </div>
  )
}
```

- [ ] **Step 2: Add Analytics to sidebar (DOC only, after Dashboard)**

Add icon:
```typescript
function AnalyticsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10" />
      <line x1="12" y1="20" x2="12" y2="4" />
      <line x1="6" y1="20" x2="6" y2="14" />
    </svg>
  )
}
```

Nav item (add right after Dashboard):
```typescript
{ label: 'Analytics', href: '/dashboard/analytics', icon: <AnalyticsIcon />, roles: ['doc'] },
```

- [ ] **Step 3: Commit**

```bash
cd /Users/canci27/Desktop/sidelineos && git add app-next/app/dashboard/analytics/page.tsx app-next/components/sidebar.tsx
git commit -m "feat: add Analytics page and sidebar link"
```
