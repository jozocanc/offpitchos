# Camp & Revenue Tracking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Camps page where DOCs can set fees and capacity for camp events, track player registrations, and see revenue summaries (expected vs collected).

**Architecture:** New `camp_registrations` table links players to camp events with fee and payment status. A new `/dashboard/camps` page shows all camp events enriched with registration counts and revenue. DOC can manage registrations and mark payments. Parents can register their children for camps.

**Tech Stack:** Supabase (existing), Next.js server actions, React client components

---

## File Structure

| File | Responsibility |
|------|---------------|
| `supabase/migrations/012_camp_registrations.sql` | New tables: camp_details (fee, capacity per event), camp_registrations (player signups + payment) |
| `app/dashboard/camps/actions.ts` | Server actions — CRUD for camp details, registrations, payment status |
| `app/dashboard/camps/page.tsx` | Server component — fetch and render camps page |
| `app/dashboard/camps/camps-client.tsx` | Client component — camp cards with revenue stats |
| `app/dashboard/camps/camp-detail-modal.tsx` | Client component — set fee/capacity, view registrations, mark payments |
| `app/dashboard/camps/register-modal.tsx` | Client component — parent registers child for a camp |
| `components/sidebar.tsx` | Modify — add Camps nav item |

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/012_camp_registrations.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Camp details — extends events of type 'camp' with fee and capacity
create table camp_details (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  club_id uuid not null references clubs(id) on delete cascade,
  fee_cents int not null default 0,
  capacity int,
  created_at timestamptz not null default now()
);

create unique index idx_camp_details_event on camp_details(event_id);
create index idx_camp_details_club on camp_details(club_id);

alter table camp_details enable row level security;

create policy camp_details_doc_all on camp_details for all
  using (club_id in (select get_doc_club_ids()));

create policy camp_details_read on camp_details for select
  using (club_id in (select get_user_club_ids()));

-- Camp registrations — players signed up for camps
create table camp_registrations (
  id uuid primary key default gen_random_uuid(),
  camp_detail_id uuid not null references camp_details(id) on delete cascade,
  player_id uuid not null references players(id) on delete cascade,
  registered_by uuid not null references profiles(id),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid')),
  created_at timestamptz not null default now()
);

create unique index idx_camp_reg_unique on camp_registrations(camp_detail_id, player_id);
create index idx_camp_reg_camp on camp_registrations(camp_detail_id);
create index idx_camp_reg_player on camp_registrations(player_id);

alter table camp_registrations enable row level security;

create policy camp_reg_doc_all on camp_registrations for all
  using (
    camp_detail_id in (
      select id from camp_details where club_id in (select get_doc_club_ids())
    )
  );

create policy camp_reg_read on camp_registrations for select
  using (
    camp_detail_id in (
      select id from camp_details where club_id in (select get_user_club_ids())
    )
  );

create policy camp_reg_parent_insert on camp_registrations for insert
  with check (
    registered_by in (select get_user_profile_ids())
  );
```

- [ ] **Step 2: Apply migration via Supabase SQL Editor**

- [ ] **Step 3: Commit**

```bash
cd /Users/canci27/Desktop/offpitchos && git add supabase/migrations/012_camp_registrations.sql
git commit -m "feat: add camp_details and camp_registrations tables"
```

---

### Task 2: Server actions

**Files:**
- Create: `app-next/app/dashboard/camps/actions.ts`

- [ ] **Step 1: Create the camp actions**

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

export async function getCampsData() {
  const { profile, supabase } = await getUserProfile()

  // Get all camp events for this club
  const { data: campEvents } = await supabase
    .from('events')
    .select('id, title, start_time, end_time, status, team_id, teams(name, age_group), venues(name)')
    .eq('club_id', profile.club_id)
    .eq('type', 'camp')
    .order('start_time', { ascending: true })

  // Get camp details (fee, capacity) for all camp events
  const { data: campDetails } = await supabase
    .from('camp_details')
    .select('id, event_id, fee_cents, capacity')
    .eq('club_id', profile.club_id)

  // Get registration counts and revenue per camp
  const detailIds = (campDetails ?? []).map(d => d.id)
  let registrations: any[] = []
  if (detailIds.length > 0) {
    const { data } = await supabase
      .from('camp_registrations')
      .select('id, camp_detail_id, payment_status')
      .in('camp_detail_id', detailIds)
    registrations = data ?? []
  }

  // Build enriched camp list
  const camps = (campEvents ?? []).map(event => {
    const detail = (campDetails ?? []).find(d => d.event_id === event.id)
    const regs = detail ? registrations.filter(r => r.camp_detail_id === detail.id) : []
    const paidCount = regs.filter(r => r.payment_status === 'paid').length
    const feeCents = detail?.fee_cents ?? 0

    return {
      eventId: event.id,
      title: event.title,
      startTime: event.start_time,
      endTime: event.end_time,
      status: event.status,
      team: (event.teams as any)?.name ?? null,
      ageGroup: (event.teams as any)?.age_group ?? null,
      venue: (event.venues as any)?.name ?? null,
      detailId: detail?.id ?? null,
      feeCents,
      capacity: detail?.capacity ?? null,
      registeredCount: regs.length,
      paidCount,
      expectedRevenue: regs.length * feeCents,
      collectedRevenue: paidCount * feeCents,
    }
  })

  return {
    camps,
    userRole: profile.role,
    userProfileId: profile.id,
  }
}

export async function setCampDetails(input: {
  eventId: string
  feeCents: number
  capacity: number | null
}) {
  const { profile, supabase } = await getUserProfile()
  if (profile.role !== 'doc') throw new Error('Only directors can set camp details')

  const { data: existing } = await supabase
    .from('camp_details')
    .select('id')
    .eq('event_id', input.eventId)
    .single()

  if (existing) {
    await supabase
      .from('camp_details')
      .update({ fee_cents: input.feeCents, capacity: input.capacity })
      .eq('id', existing.id)
  } else {
    await supabase.from('camp_details').insert({
      event_id: input.eventId,
      club_id: profile.club_id,
      fee_cents: input.feeCents,
      capacity: input.capacity,
    })
  }

  revalidatePath('/dashboard/camps')
}

export async function getCampRegistrations(eventId: string) {
  const { supabase } = await getUserProfile()

  const { data: detail } = await supabase
    .from('camp_details')
    .select('id, fee_cents, capacity')
    .eq('event_id', eventId)
    .single()

  if (!detail) return { registrations: [], feeCents: 0, capacity: null }

  const { data: regs } = await supabase
    .from('camp_registrations')
    .select('id, payment_status, created_at, players(first_name, last_name, team_id, teams(name))')
    .eq('camp_detail_id', detail.id)
    .order('created_at', { ascending: true })

  return {
    registrations: regs ?? [],
    feeCents: detail.fee_cents,
    capacity: detail.capacity,
  }
}

export async function registerForCamp(eventId: string, playerId: string) {
  const { profile, supabase } = await getUserProfile()

  const { data: detail } = await supabase
    .from('camp_details')
    .select('id, capacity')
    .eq('event_id', eventId)
    .single()

  if (!detail) throw new Error('Camp details not set up yet. Contact your director.')

  // Check capacity
  if (detail.capacity) {
    const { count } = await supabase
      .from('camp_registrations')
      .select('id', { count: 'exact', head: true })
      .eq('camp_detail_id', detail.id)

    if ((count ?? 0) >= detail.capacity) {
      throw new Error('This camp is full.')
    }
  }

  const { error } = await supabase.from('camp_registrations').insert({
    camp_detail_id: detail.id,
    player_id: playerId,
    registered_by: profile.id,
  })

  if (error) {
    if (error.code === '23505') throw new Error('This player is already registered.')
    throw new Error(`Registration failed: ${error.message}`)
  }

  revalidatePath('/dashboard/camps')
}

export async function togglePayment(registrationId: string) {
  const { profile, supabase } = await getUserProfile()
  if (profile.role !== 'doc') throw new Error('Only directors can update payment status')

  const { data: reg } = await supabase
    .from('camp_registrations')
    .select('payment_status')
    .eq('id', registrationId)
    .single()

  if (!reg) throw new Error('Registration not found')

  const newStatus = reg.payment_status === 'paid' ? 'unpaid' : 'paid'

  await supabase
    .from('camp_registrations')
    .update({ payment_status: newStatus })
    .eq('id', registrationId)

  revalidatePath('/dashboard/camps')
}

export async function getParentPlayers() {
  const { user, supabase } = await getUserProfile()

  const { data: players } = await supabase
    .from('players')
    .select('id, first_name, last_name, team_id, teams(name)')
    .eq('parent_id', user.id)

  return players ?? []
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/canci27/Desktop/offpitchos && git add app-next/app/dashboard/camps/actions.ts
git commit -m "feat: add camp & revenue server actions"
```

---

### Task 3: Camps client component

**Files:**
- Create: `app-next/app/dashboard/camps/camps-client.tsx`

- [ ] **Step 1: Create the camps client**

```tsx
'use client'

import { useState } from 'react'
import CampDetailModal from './camp-detail-modal'
import RegisterModal from './register-modal'

interface Camp {
  eventId: string
  title: string
  startTime: string
  endTime: string
  status: string
  team: string | null
  ageGroup: string | null
  venue: string | null
  detailId: string | null
  feeCents: number
  capacity: number | null
  registeredCount: number
  paidCount: number
  expectedRevenue: number
  collectedRevenue: number
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
}

export default function CampsClient({ camps, userRole, userProfileId }: { camps: Camp[]; userRole: string; userProfileId: string }) {
  const [selectedCamp, setSelectedCamp] = useState<Camp | null>(null)
  const [registerCamp, setRegisterCamp] = useState<Camp | null>(null)

  const isDoc = userRole === 'doc'
  const isParent = userRole === 'parent'

  // Split into upcoming and past
  const now = new Date()
  const upcoming = camps.filter(c => new Date(c.startTime) >= now)
  const past = camps.filter(c => new Date(c.startTime) < now)

  // Revenue totals
  const totalExpected = camps.reduce((sum, c) => sum + c.expectedRevenue, 0)
  const totalCollected = camps.reduce((sum, c) => sum + c.collectedRevenue, 0)
  const totalRegistered = camps.reduce((sum, c) => sum + c.registeredCount, 0)

  return (
    <div>
      {/* Revenue summary (DOC only) */}
      {isDoc && (
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-dark-secondary border border-white/5 rounded-xl p-5">
            <p className="text-sm text-gray mb-1">Total Registrations</p>
            <p className="text-3xl font-black text-white">{totalRegistered}</p>
          </div>
          <div className="bg-dark-secondary border border-white/5 rounded-xl p-5">
            <p className="text-sm text-gray mb-1">Expected Revenue</p>
            <p className="text-3xl font-black text-green">{formatCurrency(totalExpected)}</p>
          </div>
          <div className="bg-dark-secondary border border-white/5 rounded-xl p-5">
            <p className="text-sm text-gray mb-1">Collected</p>
            <p className="text-3xl font-black text-white">{formatCurrency(totalCollected)}</p>
          </div>
        </div>
      )}

      {/* Upcoming camps */}
      <h2 className="text-lg font-bold text-white mb-4">Upcoming Camps ({upcoming.length})</h2>
      {upcoming.length === 0 ? (
        <p className="text-gray text-sm mb-8">No upcoming camps.</p>
      ) : (
        <div className="space-y-3 mb-8">
          {upcoming.map(camp => (
            <CampCard
              key={camp.eventId}
              camp={camp}
              isDoc={isDoc}
              isParent={isParent}
              onManage={() => setSelectedCamp(camp)}
              onRegister={() => setRegisterCamp(camp)}
            />
          ))}
        </div>
      )}

      {/* Past camps */}
      {past.length > 0 && (
        <>
          <h2 className="text-lg font-bold text-white mb-4">Past Camps ({past.length})</h2>
          <div className="space-y-3 mb-8 opacity-60">
            {past.map(camp => (
              <CampCard
                key={camp.eventId}
                camp={camp}
                isDoc={isDoc}
                isParent={false}
                onManage={() => setSelectedCamp(camp)}
                onRegister={() => {}}
              />
            ))}
          </div>
        </>
      )}

      {/* Modals */}
      {selectedCamp && (
        <CampDetailModal camp={selectedCamp} onClose={() => setSelectedCamp(null)} />
      )}
      {registerCamp && (
        <RegisterModal camp={registerCamp} onClose={() => setRegisterCamp(null)} />
      )}
    </div>
  )
}

function CampCard({ camp, isDoc, isParent, onManage, onRegister }: {
  camp: Camp; isDoc: boolean; isParent: boolean; onManage: () => void; onRegister: () => void
}) {
  const start = new Date(camp.startTime)
  const end = new Date(camp.endTime)
  const dateStr = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const timeStr = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) +
    ' – ' + end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const fillPct = camp.capacity ? Math.round((camp.registeredCount / camp.capacity) * 100) : null

  return (
    <div className="bg-dark-secondary border border-white/5 rounded-xl p-5 flex items-center justify-between">
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="font-bold text-white">{camp.title}</h3>
          {camp.ageGroup && <span className="text-xs bg-green/10 text-green px-2 py-0.5 rounded">{camp.ageGroup}</span>}
          {camp.status === 'cancelled' && <span className="text-xs bg-red-500/10 text-red-400 px-2 py-0.5 rounded">Cancelled</span>}
        </div>
        <p className="text-sm text-gray">{dateStr} &middot; {timeStr}</p>
        {camp.venue && <p className="text-xs text-gray mt-0.5">{camp.venue}</p>}
        <div className="flex items-center gap-4 mt-2 text-xs text-gray">
          <span>{camp.registeredCount}{camp.capacity ? `/${camp.capacity}` : ''} registered</span>
          {fillPct !== null && <span>{fillPct}% full</span>}
          {camp.feeCents > 0 && <span>{formatCurrency(camp.feeCents)} / player</span>}
          {isDoc && camp.feeCents > 0 && (
            <span className="text-green">{formatCurrency(camp.collectedRevenue)} collected</span>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        {isDoc && (
          <button onClick={onManage} className="text-sm text-green hover:text-green/80 transition-colors">
            Manage
          </button>
        )}
        {isParent && camp.status !== 'cancelled' && (
          <button onClick={onRegister} className="text-sm bg-green text-dark font-semibold px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity">
            Register
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/canci27/Desktop/offpitchos && git add app-next/app/dashboard/camps/camps-client.tsx
git commit -m "feat: add camps client with revenue summary and camp cards"
```

---

### Task 4: Camp detail modal (DOC management)

**Files:**
- Create: `app-next/app/dashboard/camps/camp-detail-modal.tsx`

- [ ] **Step 1: Create the detail modal**

```tsx
'use client'

import { useState, useEffect } from 'react'
import { setCampDetails, getCampRegistrations, togglePayment } from './actions'

interface Camp {
  eventId: string
  title: string
  detailId: string | null
  feeCents: number
  capacity: number | null
}

interface Registration {
  id: string
  payment_status: string
  created_at: string
  players: { first_name: string; last_name: string; teams: { name: string } | null } | null
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
}

export default function CampDetailModal({ camp, onClose }: { camp: Camp; onClose: () => void }) {
  const [fee, setFee] = useState(String(camp.feeCents / 100))
  const [capacity, setCapacity] = useState(camp.capacity ? String(camp.capacity) : '')
  const [registrations, setRegistrations] = useState<Registration[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    getCampRegistrations(camp.eventId)
      .then(data => setRegistrations(data.registrations as Registration[]))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [camp.eventId])

  async function handleSave() {
    setSaving(true)
    setError(null)
    try {
      const feeCents = Math.round(parseFloat(fee || '0') * 100)
      const cap = capacity ? parseInt(capacity) : null
      if (feeCents < 0) throw new Error('Fee cannot be negative')
      if (cap !== null && cap < 1) throw new Error('Capacity must be at least 1')

      await setCampDetails({ eventId: camp.eventId, feeCents, capacity: cap })
      onClose()
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSaving(false)
    }
  }

  async function handleTogglePayment(regId: string) {
    try {
      await togglePayment(regId)
      setRegistrations(prev =>
        prev.map(r => r.id === regId
          ? { ...r, payment_status: r.payment_status === 'paid' ? 'unpaid' : 'paid' }
          : r
        )
      )
    } catch {}
  }

  const paidCount = registrations.filter(r => r.payment_status === 'paid').length
  const feeCents = Math.round(parseFloat(fee || '0') * 100)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-dark-secondary rounded-2xl p-8 w-full max-w-lg border border-white/10 shadow-2xl max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-6">{camp.title}</h2>

        {/* Fee & Capacity */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray mb-2">Fee ($)</label>
            <input
              type="number"
              value={fee}
              onChange={e => setFee(e.target.value)}
              min="0"
              step="0.01"
              className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-green transition-colors"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray mb-2">Capacity</label>
            <input
              type="number"
              value={capacity}
              onChange={e => setCapacity(e.target.value)}
              min="1"
              placeholder="Unlimited"
              className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray focus:outline-none focus:border-green transition-colors"
            />
          </div>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full bg-green text-dark font-bold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60 mb-6"
        >
          {saving ? 'Saving...' : 'Save Details'}
        </button>

        {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

        {/* Registrations */}
        <div className="border-t border-white/5 pt-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-white">Registrations ({registrations.length})</h3>
            {feeCents > 0 && (
              <span className="text-xs text-green">
                {formatCurrency(paidCount * feeCents)} / {formatCurrency(registrations.length * feeCents)}
              </span>
            )}
          </div>

          {loading ? (
            <p className="text-sm text-gray">Loading...</p>
          ) : registrations.length === 0 ? (
            <p className="text-sm text-gray">No registrations yet.</p>
          ) : (
            <div className="space-y-2">
              {registrations.map(reg => (
                <div key={reg.id} className="flex items-center justify-between bg-dark rounded-lg px-3 py-2">
                  <div>
                    <p className="text-sm text-white">
                      {reg.players?.first_name} {reg.players?.last_name}
                    </p>
                    <p className="text-xs text-gray">{(reg.players?.teams as any)?.name ?? ''}</p>
                  </div>
                  <button
                    onClick={() => handleTogglePayment(reg.id)}
                    className={`text-xs px-2.5 py-1 rounded-md font-medium transition-colors ${
                      reg.payment_status === 'paid'
                        ? 'bg-green/10 text-green'
                        : 'bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20'
                    }`}
                  >
                    {reg.payment_status === 'paid' ? 'Paid' : 'Unpaid'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={onClose}
          className="w-full mt-6 bg-dark border border-white/10 text-gray font-medium py-3 rounded-xl hover:text-white transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/canci27/Desktop/offpitchos && git add app-next/app/dashboard/camps/camp-detail-modal.tsx
git commit -m "feat: add camp detail modal — fee, capacity, registration management"
```

---

### Task 5: Register modal (parent flow)

**Files:**
- Create: `app-next/app/dashboard/camps/register-modal.tsx`

- [ ] **Step 1: Create the register modal**

```tsx
'use client'

import { useState, useEffect } from 'react'
import { registerForCamp, getParentPlayers } from './actions'

interface Camp {
  eventId: string
  title: string
  feeCents: number
  capacity: number | null
  registeredCount: number
}

interface Player {
  id: string
  first_name: string
  last_name: string
  teams: { name: string } | null
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
}

export default function RegisterModal({ camp, onClose }: { camp: Camp; onClose: () => void }) {
  const [players, setPlayers] = useState<Player[]>([])
  const [selectedPlayerId, setSelectedPlayerId] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    getParentPlayers()
      .then(data => {
        setPlayers(data as Player[])
        if (data.length > 0) setSelectedPlayerId(data[0].id)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function handleRegister() {
    if (!selectedPlayerId) return
    setSubmitting(true)
    setError(null)
    try {
      await registerForCamp(camp.eventId, selectedPlayerId)
      setSuccess(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  const spotsLeft = camp.capacity ? camp.capacity - camp.registeredCount : null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-dark-secondary rounded-2xl p-8 w-full max-w-md border border-white/10 shadow-2xl">
        <h2 className="text-xl font-bold mb-2">Register for {camp.title}</h2>
        {camp.feeCents > 0 && <p className="text-sm text-gray mb-1">Fee: {formatCurrency(camp.feeCents)}</p>}
        {spotsLeft !== null && <p className="text-sm text-gray mb-4">{spotsLeft} spots remaining</p>}

        {success ? (
          <div className="text-center py-6">
            <p className="text-green font-semibold mb-2">Registered!</p>
            <p className="text-sm text-gray">Your child has been registered for this camp.</p>
            <button onClick={onClose} className="mt-4 text-sm text-gray hover:text-white transition-colors">Close</button>
          </div>
        ) : loading ? (
          <p className="text-sm text-gray">Loading your players...</p>
        ) : players.length === 0 ? (
          <p className="text-sm text-gray">No players found. Add a player first in your profile.</p>
        ) : (
          <>
            <label className="block text-sm font-medium text-gray mb-2">Select player</label>
            <select
              value={selectedPlayerId}
              onChange={e => setSelectedPlayerId(e.target.value)}
              className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-green transition-colors appearance-none mb-4"
            >
              {players.map(p => (
                <option key={p.id} value={p.id}>
                  {p.first_name} {p.last_name} ({(p.teams as any)?.name ?? 'No team'})
                </option>
              ))}
            </select>

            {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

            <div className="flex gap-3">
              <button onClick={onClose} className="flex-1 bg-dark border border-white/10 text-gray font-medium py-3 rounded-xl hover:text-white transition-colors">
                Cancel
              </button>
              <button
                onClick={handleRegister}
                disabled={submitting || !selectedPlayerId}
                className="flex-1 bg-green text-dark font-bold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-60"
              >
                {submitting ? 'Registering...' : 'Register'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/canci27/Desktop/offpitchos && git add app-next/app/dashboard/camps/register-modal.tsx
git commit -m "feat: add camp registration modal for parents"
```

---

### Task 6: Page server component + sidebar link

**Files:**
- Create: `app-next/app/dashboard/camps/page.tsx`
- Modify: `app-next/components/sidebar.tsx`

- [ ] **Step 1: Create the page**

```tsx
import { Metadata } from 'next'
import { getCampsData } from './actions'
import CampsClient from './camps-client'

export const metadata: Metadata = {
  title: 'Camps',
}

export default async function CampsPage() {
  const { camps, userRole, userProfileId } = await getCampsData()

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Camps</h1>
        <p className="text-sm text-gray mt-1">Manage camps, registrations, and revenue.</p>
      </div>

      <CampsClient camps={camps} userRole={userRole} userProfileId={userProfileId} />
    </div>
  )
}
```

- [ ] **Step 2: Add Camps to sidebar**

Add a `CampsIcon` function and nav item in `components/sidebar.tsx`.

Icon:
```typescript
function CampsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  )
}
```

Nav item (add after Messages, before Ask):
```typescript
{ label: 'Camps', href: '/dashboard/camps', icon: <CampsIcon />, roles: ['doc', 'parent'] },
```

- [ ] **Step 3: Commit**

```bash
cd /Users/canci27/Desktop/offpitchos && git add app-next/app/dashboard/camps/page.tsx app-next/components/sidebar.tsx
git commit -m "feat: add Camps page and sidebar link"
```

---

### Task 7: End-to-end test

- [ ] **Step 1: Apply migration SQL in Supabase dashboard**

- [ ] **Step 2: Navigate to /dashboard/camps**

Verify the page loads and shows camp events from the schedule.

- [ ] **Step 3: Test setting camp details (DOC)**

Click "Manage" on a camp → set fee to $200, capacity to 30 → Save.

- [ ] **Step 4: Test revenue summary**

Verify the revenue cards at the top show correct totals.

- [ ] **Step 5: Test parent registration**

Log in as a parent, navigate to Camps, click "Register" on a camp, select a player, submit.

- [ ] **Step 6: Test payment toggle**

As DOC, open a camp with registrations, toggle a player's payment between Paid/Unpaid.

- [ ] **Step 7: Final commit**

```bash
cd /Users/canci27/Desktop/offpitchos && git add -A
git commit -m "feat: camp & revenue tracking — registrations, payments, revenue dashboard"
```
