# Player Development Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a player development system where coaches leave feedback on players (typed or voice-to-text) after practices/games, tagged by category — parents see a progress timeline for their child.

**Architecture:** New `player_feedback` table stores feedback entries linked to a player, event, and coach. New `/dashboard/players/[id]` page shows the player profile with a feedback timeline. Coaches access it from the team roster. Parents see their own children's profiles. Voice-to-text uses the browser's Web Speech API (same as voice commands).

**Tech Stack:** Supabase (existing), Web Speech API (browser), Next.js server actions, React client components

---

## File Structure

| File | Responsibility |
|------|---------------|
| `supabase/migrations/016_player_feedback.sql` | New player_feedback table |
| `app/dashboard/players/[id]/actions.ts` | Server actions — get player profile, add/get feedback |
| `app/dashboard/players/[id]/page.tsx` | Server component — player profile page |
| `app/dashboard/players/[id]/player-profile-client.tsx` | Client component — feedback timeline + add feedback form |
| `app/dashboard/players/[id]/feedback-form.tsx` | Client component — voice-to-text feedback input |
| `app/dashboard/teams/page.tsx` or team detail | Modify — add link to player profiles from roster |

---

### Task 1: Database migration

**Files:**
- Create: `supabase/migrations/016_player_feedback.sql`

- [ ] **Step 1: Write the migration**

```sql
create table player_feedback (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references players(id) on delete cascade,
  club_id uuid not null references clubs(id) on delete cascade,
  coach_id uuid not null references profiles(id),
  event_id uuid references events(id) on delete set null,
  category text not null check (category in ('technical', 'tactical', 'physical', 'attitude', 'general')),
  rating int check (rating >= 1 and rating <= 5),
  notes text not null,
  created_at timestamptz not null default now()
);

create index idx_feedback_player on player_feedback(player_id, created_at desc);
create index idx_feedback_club on player_feedback(club_id);
create index idx_feedback_coach on player_feedback(coach_id);

alter table player_feedback enable row level security;

-- DOC can see all feedback in their club
create policy feedback_doc_all on player_feedback for all
  using (club_id in (select get_doc_club_ids()));

-- Coaches can read and write feedback in their club
create policy feedback_coach_read on player_feedback for select
  using (club_id in (select get_user_club_ids()));

create policy feedback_coach_insert on player_feedback for insert
  with check (
    coach_id in (select get_user_profile_ids())
    and club_id in (select get_user_club_ids())
  );

-- Parents can read feedback for their own children
create policy feedback_parent_read on player_feedback for select
  using (
    player_id in (
      select id from players where parent_id = auth.uid()
    )
  );
```

- [ ] **Step 2: Apply via Supabase SQL Editor**

- [ ] **Step 3: Commit**

```bash
cd /Users/canci27/Desktop/sidelineos && git add supabase/migrations/016_player_feedback.sql
git commit -m "feat: add player_feedback table for development tracking"
```

---

### Task 2: Server actions

**Files:**
- Create: `app-next/app/dashboard/players/[id]/actions.ts`

- [ ] **Step 1: Create the player profile actions**

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

export async function getPlayerProfile(playerId: string) {
  const { profile, supabase } = await getUserProfile()

  // Get player info
  const { data: player } = await supabase
    .from('players')
    .select('id, first_name, last_name, jersey_number, position, date_of_birth, notes, jersey_size, shorts_size, team_id, teams(name, age_group)')
    .eq('id', playerId)
    .eq('club_id', profile.club_id)
    .single()

  if (!player) throw new Error('Player not found')

  // Get feedback history
  const { data: feedback } = await supabase
    .from('player_feedback')
    .select('id, category, rating, notes, created_at, coach_id, event_id, profiles(display_name), events(title, type, start_time)')
    .eq('player_id', playerId)
    .order('created_at', { ascending: false })
    .limit(50)

  // Get recent events for the player's team (for linking feedback to events)
  const { data: recentEvents } = await supabase
    .from('events')
    .select('id, title, type, start_time')
    .eq('team_id', player.team_id)
    .eq('status', 'scheduled')
    .order('start_time', { ascending: false })
    .limit(20)

  // Calculate category averages
  const categoryAverages: Record<string, { total: number; count: number; avg: number }> = {}
  for (const f of feedback ?? []) {
    if (f.rating) {
      if (!categoryAverages[f.category]) {
        categoryAverages[f.category] = { total: 0, count: 0, avg: 0 }
      }
      categoryAverages[f.category].total += f.rating
      categoryAverages[f.category].count += 1
      categoryAverages[f.category].avg = Math.round((categoryAverages[f.category].total / categoryAverages[f.category].count) * 10) / 10
    }
  }

  return {
    player,
    feedback: feedback ?? [],
    recentEvents: recentEvents ?? [],
    categoryAverages,
    userRole: profile.role,
    userProfileId: profile.id,
  }
}

export async function addFeedback(input: {
  playerId: string
  eventId: string | null
  category: string
  rating: number
  notes: string
}) {
  const { profile, supabase } = await getUserProfile()

  if (profile.role !== 'doc' && profile.role !== 'coach') {
    throw new Error('Only coaches and directors can add feedback')
  }

  if (!input.notes.trim()) throw new Error('Feedback notes are required')

  const { error } = await supabase.from('player_feedback').insert({
    player_id: input.playerId,
    club_id: profile.club_id,
    coach_id: profile.id,
    event_id: input.eventId || null,
    category: input.category,
    rating: input.rating,
    notes: input.notes.trim(),
  })

  if (error) throw new Error(`Failed to save feedback: ${error.message}`)

  revalidatePath(`/dashboard/players/${input.playerId}`)
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/canci27/Desktop/sidelineos && git add app-next/app/dashboard/players/\\[id\\]/actions.ts
git commit -m "feat: add player profile and feedback server actions"
```

---

### Task 3: Feedback form with voice-to-text

**Files:**
- Create: `app-next/app/dashboard/players/[id]/feedback-form.tsx`

- [ ] **Step 1: Create the feedback form**

```tsx
'use client'

import { useState, useRef } from 'react'
import { addFeedback } from './actions'

const CATEGORIES = [
  { value: 'technical', label: 'Technical', emoji: '⚽' },
  { value: 'tactical', label: 'Tactical', emoji: '🧠' },
  { value: 'physical', label: 'Physical', emoji: '💪' },
  { value: 'attitude', label: 'Attitude', emoji: '🌟' },
  { value: 'general', label: 'General', emoji: '📝' },
]

interface RecentEvent {
  id: string
  title: string
  type: string
  start_time: string
}

export default function FeedbackForm({ playerId, recentEvents }: { playerId: string; recentEvents: RecentEvent[] }) {
  const [category, setCategory] = useState('general')
  const [rating, setRating] = useState(3)
  const [notes, setNotes] = useState('')
  const [eventId, setEventId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef<any>(null)

  function startVoice() {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SpeechRecognition) return

    const recognition = new SpeechRecognition()
    recognition.lang = 'en-US'
    recognition.continuous = true
    recognition.interimResults = true
    recognitionRef.current = recognition

    recognition.onresult = (event: any) => {
      let transcript = ''
      for (let i = 0; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript
      }
      setNotes(transcript)
    }

    recognition.onend = () => setListening(false)
    recognition.onerror = () => setListening(false)

    setListening(true)
    recognition.start()
  }

  function stopVoice() {
    recognitionRef.current?.stop()
    setListening(false)
  }

  async function handleSubmit() {
    if (!notes.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      await addFeedback({
        playerId,
        eventId: eventId || null,
        category,
        rating,
        notes,
      })
      setSuccess(true)
      setNotes('')
      setRating(3)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-dark-secondary border border-white/5 rounded-xl p-5">
      <h3 className="font-bold text-white mb-4">Add Feedback</h3>

      {/* Category */}
      <div className="flex flex-wrap gap-2 mb-4">
        {CATEGORIES.map(c => (
          <button
            key={c.value}
            onClick={() => setCategory(c.value)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              category === c.value
                ? 'bg-green text-dark'
                : 'bg-white/5 border border-white/10 text-gray hover:text-white'
            }`}
          >
            {c.emoji} {c.label}
          </button>
        ))}
      </div>

      {/* Rating */}
      <div className="mb-4">
        <label className="block text-sm text-gray mb-2">Rating</label>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map(n => (
            <button
              key={n}
              onClick={() => setRating(n)}
              className={`w-9 h-9 rounded-lg text-sm font-bold transition-colors ${
                n <= rating ? 'bg-green text-dark' : 'bg-white/5 text-gray hover:text-white'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      {/* Event link */}
      {recentEvents.length > 0 && (
        <div className="mb-4">
          <label className="block text-sm text-gray mb-2">Link to event (optional)</label>
          <select
            value={eventId}
            onChange={e => setEventId(e.target.value)}
            className="w-full bg-dark border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-green transition-colors appearance-none"
          >
            <option value="">No event</option>
            {recentEvents.map(e => (
              <option key={e.id} value={e.id}>
                {e.title} — {new Date(e.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Notes with voice */}
      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm text-gray">Notes</label>
          <button
            onClick={listening ? stopVoice : startVoice}
            className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition-colors ${
              listening
                ? 'bg-red-500/20 text-red-400 animate-pulse'
                : 'bg-white/5 text-gray hover:text-white'
            }`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
            {listening ? 'Stop' : 'Voice'}
          </button>
        </div>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="How did the player perform? What should they work on?"
          rows={3}
          className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-gray focus:outline-none focus:border-green transition-colors resize-none"
        />
      </div>

      {error && <p className="text-red-400 text-sm mb-3">{error}</p>}
      {success && <p className="text-green text-sm mb-3">Feedback saved!</p>}

      <button
        onClick={handleSubmit}
        disabled={submitting || !notes.trim()}
        className="w-full bg-green text-dark font-bold py-3 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-40"
      >
        {submitting ? 'Saving...' : 'Save Feedback'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/canci27/Desktop/sidelineos && git add app-next/app/dashboard/players/\\[id\\]/feedback-form.tsx
git commit -m "feat: add feedback form with voice-to-text and category rating"
```

---

### Task 4: Player profile client component

**Files:**
- Create: `app-next/app/dashboard/players/[id]/player-profile-client.tsx`

- [ ] **Step 1: Create the player profile client**

```tsx
'use client'

import FeedbackForm from './feedback-form'

interface Feedback {
  id: string
  category: string
  rating: number | null
  notes: string
  created_at: string
  profiles: { display_name: string } | null
  events: { title: string; type: string; start_time: string } | null
}

interface Player {
  first_name: string
  last_name: string
  jersey_number: number | null
  position: string | null
  date_of_birth: string | null
  jersey_size: string | null
  shorts_size: string | null
  teams: { name: string; age_group: string } | null
}

interface RecentEvent {
  id: string
  title: string
  type: string
  start_time: string
}

const CATEGORY_EMOJI: Record<string, string> = {
  technical: '⚽',
  tactical: '🧠',
  physical: '💪',
  attitude: '🌟',
  general: '📝',
}

export default function PlayerProfileClient({ player, feedback, recentEvents, categoryAverages, userRole, playerId }: {
  player: Player
  feedback: Feedback[]
  recentEvents: RecentEvent[]
  categoryAverages: Record<string, { avg: number; count: number }>
  userRole: string
  playerId: string
}) {
  const canAddFeedback = userRole === 'doc' || userRole === 'coach'
  const team = player.teams as any

  return (
    <div>
      {/* Player header */}
      <div className="bg-dark-secondary border border-white/5 rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-black text-white">
              {player.first_name} {player.last_name}
              {player.jersey_number && <span className="text-green ml-2">#{player.jersey_number}</span>}
            </h2>
            <div className="flex items-center gap-3 mt-2 text-sm text-gray">
              {team && <span>{team.name} ({team.age_group})</span>}
              {player.position && <span>· {player.position}</span>}
            </div>
          </div>
          {player.jersey_size && (
            <div className="text-right text-xs text-gray">
              <p>Jersey: {player.jersey_size}</p>
              {player.shorts_size && <p>Shorts: {player.shorts_size}</p>}
            </div>
          )}
        </div>

        {/* Category averages */}
        {Object.keys(categoryAverages).length > 0 && (
          <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-white/5">
            {Object.entries(categoryAverages).map(([cat, data]) => (
              <div key={cat} className="bg-dark rounded-lg px-3 py-2 text-center">
                <p className="text-xs text-gray capitalize">{CATEGORY_EMOJI[cat]} {cat}</p>
                <p className="text-lg font-bold text-green">{data.avg}</p>
                <p className="text-xs text-gray">{data.count} reviews</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Feedback form (coaches/DOC) */}
        {canAddFeedback && (
          <div className="lg:col-span-1">
            <FeedbackForm playerId={playerId} recentEvents={recentEvents} />
          </div>
        )}

        {/* Feedback timeline */}
        <div className={canAddFeedback ? 'lg:col-span-2' : 'lg:col-span-3'}>
          <h3 className="font-bold text-white mb-4">Development Timeline ({feedback.length})</h3>

          {feedback.length === 0 ? (
            <p className="text-gray text-sm">No feedback yet.</p>
          ) : (
            <div className="space-y-3">
              {feedback.map(f => {
                const coachName = (f.profiles as any)?.display_name ?? 'Coach'
                const event = f.events as any
                const date = new Date(f.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

                return (
                  <div key={f.id} className="bg-dark-secondary border border-white/5 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span>{CATEGORY_EMOJI[f.category] ?? '📝'}</span>
                        <span className="text-xs font-medium text-white capitalize">{f.category}</span>
                        {f.rating && (
                          <span className="text-xs bg-green/10 text-green px-1.5 py-0.5 rounded">{f.rating}/5</span>
                        )}
                      </div>
                      <span className="text-xs text-gray">{date}</span>
                    </div>
                    <p className="text-sm text-white/80 mb-2">{f.notes}</p>
                    <div className="flex items-center gap-2 text-xs text-gray">
                      <span>— {coachName}</span>
                      {event && (
                        <span>· {event.title} ({new Date(event.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/canci27/Desktop/sidelineos && git add app-next/app/dashboard/players/\\[id\\]/player-profile-client.tsx
git commit -m "feat: add player profile client with development timeline"
```

---

### Task 5: Page server component

**Files:**
- Create: `app-next/app/dashboard/players/[id]/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
import { Metadata } from 'next'
import { getPlayerProfile } from './actions'
import PlayerProfileClient from './player-profile-client'

export const metadata: Metadata = {
  title: 'Player Profile',
}

export default async function PlayerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { player, feedback, recentEvents, categoryAverages, userRole, userProfileId } = await getPlayerProfile(id)

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <PlayerProfileClient
        player={player as any}
        feedback={feedback as any}
        recentEvents={recentEvents}
        categoryAverages={categoryAverages}
        userRole={userRole}
        playerId={id}
      />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/canci27/Desktop/sidelineos && git add app-next/app/dashboard/players/\\[id\\]/page.tsx
git commit -m "feat: add player profile page"
```

---

### Task 6: Link to player profiles from teams

**Files:**
- Modify: team roster component (wherever players are listed)

- [ ] **Step 1: Find where players are listed in the teams section**

Look for a player list in `app/dashboard/teams/` or in the attendance modal.

- [ ] **Step 2: Add a link to each player's profile**

Wrap player names in a Next.js `Link` to `/dashboard/players/${player.id}`.

- [ ] **Step 3: Commit**

```bash
cd /Users/canci27/Desktop/sidelineos && git add app-next/app/dashboard/
git commit -m "feat: link player names to development profiles"
```

---

### Task 7: End-to-end test

- [ ] **Step 1: Apply migration in Supabase SQL Editor**

- [ ] **Step 2: Navigate to a player profile**

Click a player name from a team roster → verify the profile page loads.

- [ ] **Step 3: Test adding feedback**

Select a category, give a rating, type or dictate notes, click Save. Verify it appears in the timeline.

- [ ] **Step 4: Test voice-to-text**

Click the Voice button on the feedback form, speak feedback, verify text appears.

- [ ] **Step 5: Test category averages**

Add multiple feedback entries with ratings → verify averages update in the header.

- [ ] **Step 6: Final commit**

```bash
cd /Users/canci27/Desktop/sidelineos && git add -A
git commit -m "feat: player development profiles — feedback, ratings, voice-to-text, timeline"
```
