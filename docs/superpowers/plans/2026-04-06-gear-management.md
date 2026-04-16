# Gear Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add gear size tracking for players and a gear orders page where DOCs can see aggregated size breakdowns per team, making club-wide gear ordering effortless.

**Architecture:** Add `jersey_size` and `shorts_size` columns to the existing `players` table. New `/dashboard/gear` page queries all players grouped by team, aggregates sizes into counts, and displays a clear order summary. Parents update sizes via player profiles. No new tables needed — just columns + a new page.

**Tech Stack:** Supabase (existing), Next.js server actions, React client components

---

## File Structure

| File | Responsibility |
|------|---------------|
| `supabase/migrations/013_player_sizes.sql` | Add size columns to players table |
| `app/dashboard/gear/actions.ts` | Server actions — fetch gear data aggregated by team |
| `app/dashboard/gear/page.tsx` | Server component — render gear page |
| `app/dashboard/gear/gear-client.tsx` | Client component — size summary cards, team breakdowns |
| `components/sidebar.tsx` | Modify — add Gear nav item |

---

### Task 1: Database migration — add size columns

**Files:**
- Create: `supabase/migrations/013_player_sizes.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Add gear size columns to players
alter table players add column jersey_size text;
alter table players add column shorts_size text;
```

- [ ] **Step 2: Apply via Supabase SQL Editor**

- [ ] **Step 3: Commit**

```bash
cd /Users/canci27/Desktop/offpitchos && git add supabase/migrations/013_player_sizes.sql
git commit -m "feat: add jersey_size and shorts_size to players table"
```

---

### Task 2: Server actions

**Files:**
- Create: `app-next/app/dashboard/gear/actions.ts`

- [ ] **Step 1: Create the gear actions**

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'

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

interface TeamGearSummary {
  teamId: string
  teamName: string
  ageGroup: string
  playerCount: number
  jerseyBreakdown: Record<string, number>
  shortsBreakdown: Record<string, number>
  missingCount: number
  players: { id: string; firstName: string; lastName: string; jerseySize: string | null; shortsSize: string | null }[]
}

export async function getGearData(): Promise<{ teams: TeamGearSummary[]; userRole: string }> {
  const { profile, supabase } = await getUserProfile()

  const { data: teams } = await supabase
    .from('teams')
    .select('id, name, age_group')
    .eq('club_id', profile.club_id)
    .order('age_group', { ascending: true })

  const { data: players } = await supabase
    .from('players')
    .select('id, first_name, last_name, team_id, jersey_size, shorts_size')
    .eq('club_id', profile.club_id)

  const teamSummaries: TeamGearSummary[] = (teams ?? []).map(team => {
    const teamPlayers = (players ?? []).filter(p => p.team_id === team.id)

    const jerseyBreakdown: Record<string, number> = {}
    const shortsBreakdown: Record<string, number> = {}
    let missingCount = 0

    for (const p of teamPlayers) {
      if (p.jersey_size) {
        jerseyBreakdown[p.jersey_size] = (jerseyBreakdown[p.jersey_size] ?? 0) + 1
      }
      if (p.shorts_size) {
        shortsBreakdown[p.shorts_size] = (shortsBreakdown[p.shorts_size] ?? 0) + 1
      }
      if (!p.jersey_size || !p.shorts_size) {
        missingCount++
      }
    }

    return {
      teamId: team.id,
      teamName: team.name,
      ageGroup: team.age_group,
      playerCount: teamPlayers.length,
      jerseyBreakdown,
      shortsBreakdown,
      missingCount,
      players: teamPlayers.map(p => ({
        id: p.id,
        firstName: p.first_name,
        lastName: p.last_name,
        jerseySize: p.jersey_size,
        shortsSize: p.shorts_size,
      })),
    }
  })

  return { teams: teamSummaries, userRole: profile.role }
}

export async function updatePlayerSize(playerId: string, jerseySize: string | null, shortsSize: string | null) {
  const { supabase } = await getUserProfile()

  const { error } = await supabase
    .from('players')
    .update({ jersey_size: jerseySize || null, shorts_size: shortsSize || null })
    .eq('id', playerId)

  if (error) throw new Error(`Failed to update size: ${error.message}`)

  revalidatePath('/dashboard/gear')
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/canci27/Desktop/offpitchos && git add app-next/app/dashboard/gear/actions.ts
git commit -m "feat: add gear data server actions with size aggregation"
```

---

### Task 3: Gear client component

**Files:**
- Create: `app-next/app/dashboard/gear/gear-client.tsx`

- [ ] **Step 1: Create the gear client**

```tsx
'use client'

import { useState } from 'react'
import { updatePlayerSize } from './actions'

const JERSEY_SIZES = ['YXS', 'YS', 'YM', 'YL', 'YXL', 'AS', 'AM', 'AL', 'AXL', 'AXXL']
const SHORTS_SIZES = ['YXS', 'YS', 'YM', 'YL', 'YXL', 'AS', 'AM', 'AL', 'AXL', 'AXXL']

interface Player {
  id: string
  firstName: string
  lastName: string
  jerseySize: string | null
  shortsSize: string | null
}

interface TeamGearSummary {
  teamId: string
  teamName: string
  ageGroup: string
  playerCount: number
  jerseyBreakdown: Record<string, number>
  shortsBreakdown: Record<string, number>
  missingCount: number
  players: Player[]
}

export default function GearClient({ teams, userRole }: { teams: TeamGearSummary[]; userRole: string }) {
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null)
  const isDoc = userRole === 'doc'

  // Club-wide totals
  const totalPlayers = teams.reduce((sum, t) => sum + t.playerCount, 0)
  const totalMissing = teams.reduce((sum, t) => sum + t.missingCount, 0)

  // Club-wide jersey aggregation
  const clubJerseys: Record<string, number> = {}
  const clubShorts: Record<string, number> = {}
  for (const team of teams) {
    for (const [size, count] of Object.entries(team.jerseyBreakdown)) {
      clubJerseys[size] = (clubJerseys[size] ?? 0) + count
    }
    for (const [size, count] of Object.entries(team.shortsBreakdown)) {
      clubShorts[size] = (clubShorts[size] ?? 0) + count
    }
  }

  return (
    <div>
      {/* Club-wide summary */}
      {isDoc && (
        <div className="mb-8">
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-dark-secondary border border-white/5 rounded-xl p-5">
              <p className="text-sm text-gray mb-1">Total Players</p>
              <p className="text-3xl font-black text-white">{totalPlayers}</p>
            </div>
            <div className="bg-dark-secondary border border-white/5 rounded-xl p-5">
              <p className="text-sm text-gray mb-1">Sizes Submitted</p>
              <p className="text-3xl font-black text-green">{totalPlayers - totalMissing}</p>
            </div>
            <div className="bg-dark-secondary border border-white/5 rounded-xl p-5">
              <p className="text-sm text-gray mb-1">Missing Sizes</p>
              <p className={`text-3xl font-black ${totalMissing > 0 ? 'text-yellow-400' : 'text-white'}`}>{totalMissing}</p>
            </div>
          </div>

          {/* Club-wide size breakdown */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            <SizeBreakdownCard title="Jersey Sizes (Club)" breakdown={clubJerseys} />
            <SizeBreakdownCard title="Shorts Sizes (Club)" breakdown={clubShorts} />
          </div>
        </div>
      )}

      {/* Per-team breakdown */}
      <h2 className="text-lg font-bold text-white mb-4">By Team</h2>
      <div className="space-y-3">
        {teams.map(team => (
          <div key={team.teamId} className="bg-dark-secondary border border-white/5 rounded-xl">
            <button
              onClick={() => setExpandedTeam(expandedTeam === team.teamId ? null : team.teamId)}
              className="w-full flex items-center justify-between p-5 text-left"
            >
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-white">{team.teamName}</h3>
                  <span className="text-xs bg-green/10 text-green px-2 py-0.5 rounded">{team.ageGroup}</span>
                </div>
                <p className="text-sm text-gray mt-1">
                  {team.playerCount} players &middot; {team.missingCount > 0 ? `${team.missingCount} missing sizes` : 'All sizes in'}
                </p>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                className={`text-gray transition-transform ${expandedTeam === team.teamId ? 'rotate-180' : ''}`}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {expandedTeam === team.teamId && (
              <div className="px-5 pb-5 border-t border-white/5 pt-4">
                {/* Size breakdowns */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <SizeBreakdownCard title="Jerseys" breakdown={team.jerseyBreakdown} />
                  <SizeBreakdownCard title="Shorts" breakdown={team.shortsBreakdown} />
                </div>

                {/* Player list with sizes */}
                {isDoc && (
                  <div className="space-y-2">
                    <p className="text-xs text-gray font-semibold uppercase tracking-wide mb-2">Players</p>
                    {team.players.map(player => (
                      <PlayerSizeRow key={player.id} player={player} isDoc={isDoc} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function SizeBreakdownCard({ title, breakdown }: { title: string; breakdown: Record<string, number> }) {
  const sorted = Object.entries(breakdown).sort((a, b) => {
    const order = JERSEY_SIZES
    return order.indexOf(a[0]) - order.indexOf(b[0])
  })

  return (
    <div className="bg-dark rounded-lg p-3">
      <p className="text-xs text-gray font-semibold mb-2">{title}</p>
      {sorted.length === 0 ? (
        <p className="text-xs text-gray">No data yet</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {sorted.map(([size, count]) => (
            <span key={size} className="text-xs bg-white/5 border border-white/10 rounded px-2 py-1 text-white">
              {size}: <span className="font-bold text-green">{count}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function PlayerSizeRow({ player, isDoc }: { player: Player; isDoc: boolean }) {
  const [jerseySize, setJerseySize] = useState(player.jerseySize ?? '')
  const [shortsSize, setShortsSize] = useState(player.shortsSize ?? '')
  const [saving, setSaving] = useState(false)

  const hasChanges = jerseySize !== (player.jerseySize ?? '') || shortsSize !== (player.shortsSize ?? '')

  async function handleSave() {
    setSaving(true)
    try {
      await updatePlayerSize(player.id, jerseySize || null, shortsSize || null)
    } catch {}
    setSaving(false)
  }

  return (
    <div className="flex items-center gap-3 bg-dark/50 rounded-lg px-3 py-2">
      <span className="text-sm text-white flex-1">{player.firstName} {player.lastName}</span>
      <select
        value={jerseySize}
        onChange={e => setJerseySize(e.target.value)}
        className="bg-dark border border-white/10 rounded px-2 py-1 text-xs text-white appearance-none"
      >
        <option value="">Jersey</option>
        {JERSEY_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <select
        value={shortsSize}
        onChange={e => setShortsSize(e.target.value)}
        className="bg-dark border border-white/10 rounded px-2 py-1 text-xs text-white appearance-none"
      >
        <option value="">Shorts</option>
        {SHORTS_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      {hasChanges && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-xs bg-green text-dark font-semibold px-2 py-1 rounded hover:opacity-90 disabled:opacity-50"
        >
          {saving ? '...' : 'Save'}
        </button>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/canci27/Desktop/offpitchos && git add app-next/app/dashboard/gear/gear-client.tsx
git commit -m "feat: add gear client with size aggregation and player editing"
```

---

### Task 4: Page + sidebar link

**Files:**
- Create: `app-next/app/dashboard/gear/page.tsx`
- Modify: `app-next/components/sidebar.tsx`

- [ ] **Step 1: Create the page**

```tsx
import { Metadata } from 'next'
import { getGearData } from './actions'
import GearClient from './gear-client'

export const metadata: Metadata = {
  title: 'Gear',
}

export default async function GearPage() {
  const { teams, userRole } = await getGearData()

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Gear</h1>
        <p className="text-sm text-gray mt-1">Player sizes and gear order summaries.</p>
      </div>

      <GearClient teams={teams} userRole={userRole} />
    </div>
  )
}
```

- [ ] **Step 2: Add Gear to sidebar**

Add `GearIcon` function and nav item in `components/sidebar.tsx`.

Icon:
```typescript
function GearIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.38 3.46L16 2 7.56 10.46a2 2 0 0 0 0 2.83l3.15 3.15a2 2 0 0 0 2.83 0L22 8l-1.46-4.38z" />
      <path d="M7 17l-5 5" />
      <path d="M4 4l3 3" />
    </svg>
  )
}
```

Nav item (add after Camps, before Ask):
```typescript
{ label: 'Gear', href: '/dashboard/gear', icon: <GearIcon />, roles: ['doc'] },
```

- [ ] **Step 3: Commit**

```bash
cd /Users/canci27/Desktop/offpitchos && git add app-next/app/dashboard/gear/page.tsx app-next/components/sidebar.tsx
git commit -m "feat: add Gear page and sidebar link"
```

---

### Task 5: End-to-end test

- [ ] **Step 1: Apply migration SQL in Supabase dashboard**

- [ ] **Step 2: Navigate to /dashboard/gear**

Verify page loads with team cards showing "0 players" or player counts.

- [ ] **Step 3: Test size entry**

Expand a team, set a player's jersey and shorts sizes, click Save.

- [ ] **Step 4: Verify aggregation**

Confirm the team breakdown and club-wide summary update with the saved sizes.

- [ ] **Step 5: Final commit**

```bash
cd /Users/canci27/Desktop/offpitchos && git add -A
git commit -m "feat: gear management — player sizes, team breakdowns, order summaries"
```
