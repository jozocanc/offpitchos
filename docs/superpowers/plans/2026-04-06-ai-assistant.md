# AI Assistant (Parent FAQ) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a dedicated "Ask" page where parents (and coaches) can ask natural-language questions and get instant AI answers based on their club's real data (schedule, teams, roster, announcements, attendance).

**Architecture:** Server action calls Claude API with club context (schedule, teams, players, announcements) assembled from Supabase. Chat UI with message history stored in a new `ai_chats` table. DOC gets a read-only log of all AI conversations across the club.

**Tech Stack:** Anthropic SDK (`@anthropic-ai/sdk`), Supabase (existing), Next.js server actions, React client component

---

## File Structure

| File | Responsibility |
|------|---------------|
| `app/dashboard/ask/page.tsx` | Server component — fetch initial data, render client |
| `app/dashboard/ask/actions.ts` | Server actions — gather context, call Claude, persist chat |
| `app/dashboard/ask/ask-client.tsx` | Client component — chat UI, send/receive messages |
| `app/dashboard/ask/ai-log-client.tsx` | Client component — DOC-only log view of all AI chats |
| `lib/ai.ts` | Claude API wrapper — single function, system prompt, context formatting |
| `components/sidebar.tsx` | Modify — add "Ask" nav item |
| `supabase/migrations/011_ai_chats.sql` | New table for persisting AI chat history |

---

### Task 1: Install Anthropic SDK

**Files:**
- Modify: `app-next/package.json`

- [ ] **Step 1: Install the SDK**

```bash
cd /Users/canci27/Desktop/offpitchos/app-next && npm install @anthropic-ai/sdk
```

- [ ] **Step 2: Add API key to .env.local**

Add to `.env.local`:
```
ANTHROPIC_API_KEY=<key>
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install @anthropic-ai/sdk"
```

---

### Task 2: Database migration — ai_chats table

**Files:**
- Create: `supabase/migrations/011_ai_chats.sql`

- [ ] **Step 1: Write the migration**

```sql
-- AI chat history for the Ask page
create table ai_chats (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  question text not null,
  answer text not null,
  created_at timestamptz not null default now()
);

-- Indexes
create index idx_ai_chats_club on ai_chats(club_id, created_at desc);
create index idx_ai_chats_profile on ai_chats(profile_id, created_at desc);

-- RLS
alter table ai_chats enable row level security;

-- Users can read their own chats
create policy ai_chats_own_read on ai_chats
  for select using (
    profile_id in (select get_user_profile_ids())
  );

-- DOC can read all chats in their club
create policy ai_chats_doc_read on ai_chats
  for select using (
    club_id in (select get_doc_club_ids())
  );

-- Users can insert their own chats
create policy ai_chats_insert on ai_chats
  for insert with check (
    profile_id in (select get_user_profile_ids())
    and club_id in (select get_user_club_ids())
  );
```

- [ ] **Step 2: Apply migration to Supabase**

```bash
cd /Users/canci27/Desktop/offpitchos && npx supabase db push
```
Or apply via Supabase dashboard SQL editor if local CLI isn't configured.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/011_ai_chats.sql
git commit -m "feat: add ai_chats table for AI assistant history"
```

---

### Task 3: Claude API wrapper

**Files:**
- Create: `app-next/lib/ai.ts`

- [ ] **Step 1: Create the AI wrapper**

```typescript
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

interface ClubContext {
  clubName: string
  teams: { name: string; ageGroup: string; coaches: string[]; playerCount: number }[]
  upcomingEvents: { title: string; type: string; team: string; date: string; time: string; venue: string; status: string }[]
  recentAnnouncements: { title: string; body: string; team: string | null; date: string }[]
}

function formatContext(ctx: ClubContext): string {
  let text = `Club: ${ctx.clubName}\n\n`

  text += `## Teams\n`
  for (const t of ctx.teams) {
    text += `- ${t.name} (${t.ageGroup}): ${t.playerCount} players, coaches: ${t.coaches.join(', ') || 'none assigned'}\n`
  }

  text += `\n## Upcoming Events (next 14 days)\n`
  if (ctx.upcomingEvents.length === 0) {
    text += `No upcoming events.\n`
  }
  for (const e of ctx.upcomingEvents) {
    text += `- ${e.date} ${e.time} — ${e.title} (${e.type}, ${e.team}) at ${e.venue || 'TBD'}${e.status === 'cancelled' ? ' [CANCELLED]' : ''}\n`
  }

  text += `\n## Recent Announcements\n`
  if (ctx.recentAnnouncements.length === 0) {
    text += `No recent announcements.\n`
  }
  for (const a of ctx.recentAnnouncements) {
    text += `- ${a.date}: "${a.title}" ${a.team ? `(${a.team})` : '(club-wide)'} — ${a.body.slice(0, 200)}\n`
  }

  return text
}

const SYSTEM_PROMPT = `You are the OffPitchOS AI Assistant for a youth soccer club. You answer questions from parents, coaches, and directors based on the club's real data provided below.

Rules:
- Only answer based on the data provided. If the data doesn't contain the answer, say so honestly.
- Be concise and friendly. Use plain language, not jargon.
- Format dates and times clearly (e.g. "Saturday Apr 12 at 4:00 PM").
- If a practice or game is cancelled, make that very clear.
- Never make up information. If you're unsure, say "I don't have that information — check with your coach or director."
- Keep answers short — 2-4 sentences max unless the question requires a list.`

export async function askClubQuestion(question: string, context: ClubContext): Promise<string> {
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    system: SYSTEM_PROMPT + '\n\n---\n\n' + formatContext(context),
    messages: [{ role: 'user', content: question }],
  })

  const block = message.content[0]
  if (block.type === 'text') return block.text
  return 'Sorry, I couldn\'t generate a response. Please try again.'
}
```

- [ ] **Step 2: Commit**

```bash
git add app-next/lib/ai.ts
git commit -m "feat: add Claude API wrapper for AI assistant"
```

---

### Task 4: Server actions — context gathering + ask endpoint

**Files:**
- Create: `app-next/app/dashboard/ask/actions.ts`

- [ ] **Step 1: Write the server actions**

```typescript
'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { askClubQuestion } from '@/lib/ai'

async function getUserProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, club_id, role, display_name')
    .eq('user_id', user.id)
    .single()

  if (!profile?.club_id) throw new Error('No club found')
  return { user, profile, supabase }
}

export async function getAskPageData() {
  const { profile, supabase } = await getUserProfile()

  // Fetch user's own chat history (last 50)
  const { data: chatHistory } = await supabase
    .from('ai_chats')
    .select('id, question, answer, created_at')
    .eq('profile_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(50)

  return {
    userRole: profile.role,
    chatHistory: (chatHistory ?? []).reverse(),
  }
}

export async function askQuestion(question: string) {
  if (!question.trim()) throw new Error('Question cannot be empty')
  if (question.length > 500) throw new Error('Question too long (max 500 characters)')

  const { profile, supabase } = await getUserProfile()

  // Gather club context
  const { data: club } = await supabase
    .from('clubs')
    .select('name')
    .eq('id', profile.club_id)
    .single()

  // Teams with coaches and player count
  const { data: teams } = await supabase
    .from('teams')
    .select('id, name, age_group')
    .eq('club_id', profile.club_id)

  const teamData = []
  for (const team of teams ?? []) {
    const { data: members } = await supabase
      .from('team_members')
      .select('profiles(display_name), role')
      .eq('team_id', team.id)

    const { count: playerCount } = await supabase
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('team_id', team.id)

    const coaches = (members ?? [])
      .filter((m: any) => m.role === 'coach')
      .map((m: any) => m.profiles?.display_name ?? 'Unknown')

    teamData.push({
      name: team.name,
      ageGroup: team.age_group,
      coaches,
      playerCount: playerCount ?? 0,
    })
  }

  // Upcoming events (next 14 days)
  const now = new Date()
  const twoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000)

  const { data: events } = await supabase
    .from('events')
    .select('title, type, start_time, end_time, status, teams(name), venues(name)')
    .eq('club_id', profile.club_id)
    .gte('start_time', now.toISOString())
    .lte('start_time', twoWeeks.toISOString())
    .order('start_time', { ascending: true })
    .limit(50)

  const upcomingEvents = (events ?? []).map((e: any) => ({
    title: e.title,
    type: e.type,
    team: e.teams?.name ?? 'Club',
    date: new Date(e.start_time).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
    time: new Date(e.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
    venue: e.venues?.name ?? 'TBD',
    status: e.status,
  }))

  // Recent announcements (last 7 days)
  const oneWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  const { data: announcements } = await supabase
    .from('announcements')
    .select('title, body, created_at, teams(name)')
    .eq('club_id', profile.club_id)
    .gte('created_at', oneWeek.toISOString())
    .order('created_at', { ascending: false })
    .limit(20)

  const recentAnnouncements = (announcements ?? []).map((a: any) => ({
    title: a.title,
    body: a.body,
    team: a.teams?.name ?? null,
    date: new Date(a.created_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
  }))

  // Call Claude
  const answer = await askClubQuestion(question, {
    clubName: club?.name ?? 'Unknown Club',
    teams: teamData,
    upcomingEvents,
    recentAnnouncements,
  })

  // Persist to ai_chats
  await supabase.from('ai_chats').insert({
    club_id: profile.club_id,
    profile_id: profile.id,
    question: question.trim(),
    answer,
  })

  return { answer }
}

// DOC-only: get all AI chats across the club
export async function getAiLog() {
  const { profile, supabase } = await getUserProfile()
  if (profile.role !== 'doc') throw new Error('Unauthorized')

  const { data: chats } = await supabase
    .from('ai_chats')
    .select('id, question, answer, created_at, profiles(display_name)')
    .eq('club_id', profile.club_id)
    .order('created_at', { ascending: false })
    .limit(100)

  return chats ?? []
}
```

- [ ] **Step 2: Commit**

```bash
git add app-next/app/dashboard/ask/actions.ts
git commit -m "feat: add server actions for AI assistant — context gathering + Claude call"
```

---

### Task 5: Chat UI — client component

**Files:**
- Create: `app-next/app/dashboard/ask/ask-client.tsx`

- [ ] **Step 1: Create the chat client component**

```tsx
'use client'

import { useState, useRef, useEffect } from 'react'
import { askQuestion } from './actions'

interface ChatMessage {
  id: string
  question: string
  answer: string
  created_at: string
}

export default function AskClient({ chatHistory, userRole }: { chatHistory: ChatMessage[]; userRole: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>(chatHistory)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || loading) return

    const question = input.trim()
    setInput('')
    setError(null)
    setLoading(true)

    // Optimistic: show the question immediately
    const tempId = crypto.randomUUID()
    setMessages(prev => [...prev, { id: tempId, question, answer: '', created_at: new Date().toISOString() }])

    try {
      const { answer } = await askQuestion(question)
      setMessages(prev =>
        prev.map(m => m.id === tempId ? { ...m, answer } : m)
      )
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong')
      setMessages(prev => prev.filter(m => m.id !== tempId))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      {/* Chat messages */}
      <div className="flex-1 overflow-y-auto space-y-6 pb-4">
        {messages.length === 0 && !loading && (
          <div className="text-center text-gray mt-20">
            <div className="text-4xl mb-4">⚽</div>
            <p className="text-lg font-medium text-white/80">Ask anything about your club</p>
            <p className="text-sm mt-2">Schedule, teams, events, announcements — I have all the info.</p>
            <div className="mt-6 flex flex-wrap justify-center gap-2">
              {[
                'What\'s the schedule this week?',
                'Who coaches U12?',
                'Any cancelled practices?',
                'When is the next game?',
              ].map(suggestion => (
                <button
                  key={suggestion}
                  onClick={() => setInput(suggestion)}
                  className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm text-white/70 hover:bg-white/10 hover:text-white transition-colors"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map(msg => (
          <div key={msg.id} className="space-y-3">
            {/* User question */}
            <div className="flex justify-end">
              <div className="bg-green/10 border border-green/20 rounded-2xl rounded-br-md px-4 py-2.5 max-w-[80%]">
                <p className="text-white text-sm">{msg.question}</p>
              </div>
            </div>

            {/* AI answer */}
            {msg.answer ? (
              <div className="flex justify-start">
                <div className="bg-white/5 border border-white/10 rounded-2xl rounded-bl-md px-4 py-2.5 max-w-[80%]">
                  <p className="text-white/90 text-sm whitespace-pre-wrap">{msg.answer}</p>
                </div>
              </div>
            ) : (
              <div className="flex justify-start">
                <div className="bg-white/5 border border-white/10 rounded-2xl rounded-bl-md px-4 py-3 max-w-[80%]">
                  <div className="flex items-center gap-2 text-sm text-gray">
                    <span className="inline-block w-1.5 h-1.5 bg-green rounded-full animate-pulse" />
                    Thinking...
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}

        <div ref={bottomRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="mb-2 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
          {error}
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex gap-3 pt-4 border-t border-white/5">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          placeholder="Ask about schedule, teams, events..."
          maxLength={500}
          disabled={loading}
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder:text-gray focus:outline-none focus:border-green/50 disabled:opacity-50 transition-colors"
        />
        <button
          type="submit"
          disabled={!input.trim() || loading}
          className="px-5 py-3 bg-green text-dark font-semibold rounded-xl text-sm hover:bg-green/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          {loading ? '...' : 'Ask'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app-next/app/dashboard/ask/ask-client.tsx
git commit -m "feat: add chat UI for AI assistant"
```

---

### Task 6: DOC log view — client component

**Files:**
- Create: `app-next/app/dashboard/ask/ai-log-client.tsx`

- [ ] **Step 1: Create the DOC log component**

```tsx
'use client'

import { useState, useEffect } from 'react'
import { getAiLog } from './actions'

interface LogEntry {
  id: string
  question: string
  answer: string
  created_at: string
  profiles: { display_name: string } | null
}

export default function AiLogClient() {
  const [entries, setEntries] = useState<LogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [showLog, setShowLog] = useState(false)

  useEffect(() => {
    if (!showLog) return
    setLoading(true)
    getAiLog()
      .then(data => setEntries(data as LogEntry[]))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [showLog])

  return (
    <div className="mb-6">
      <button
        onClick={() => setShowLog(!showLog)}
        className="text-sm text-gray hover:text-white transition-colors flex items-center gap-2"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
        </svg>
        {showLog ? 'Hide' : 'View'} AI Chat Log
      </button>

      {showLog && (
        <div className="mt-4 bg-white/5 border border-white/10 rounded-xl max-h-96 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-gray text-sm">Loading log...</div>
          ) : entries.length === 0 ? (
            <div className="p-4 text-gray text-sm">No AI chats yet.</div>
          ) : (
            <div className="divide-y divide-white/5">
              {entries.map(entry => (
                <div key={entry.id} className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-green">{entry.profiles?.display_name ?? 'Unknown'}</span>
                    <span className="text-xs text-gray">
                      {new Date(entry.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </span>
                  </div>
                  <p className="text-sm text-white/80 mb-1">Q: {entry.question}</p>
                  <p className="text-sm text-gray">A: {entry.answer}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app-next/app/dashboard/ask/ai-log-client.tsx
git commit -m "feat: add DOC AI chat log viewer"
```

---

### Task 7: Page server component

**Files:**
- Create: `app-next/app/dashboard/ask/page.tsx`

- [ ] **Step 1: Create the page**

```tsx
import { Metadata } from 'next'
import { getAskPageData } from './actions'
import AskClient from './ask-client'
import AiLogClient from './ai-log-client'

export const metadata: Metadata = {
  title: 'Ask',
}

export default async function AskPage() {
  const { chatHistory, userRole } = await getAskPageData()

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Ask OffPitchOS</h1>
        <p className="text-sm text-gray mt-1">Get instant answers about your club — schedule, teams, events, and more.</p>
      </div>

      {userRole === 'doc' && <AiLogClient />}

      <AskClient chatHistory={chatHistory} userRole={userRole} />
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app-next/app/dashboard/ask/page.tsx
git commit -m "feat: add Ask page server component"
```

---

### Task 8: Add "Ask" to sidebar navigation

**Files:**
- Modify: `app-next/components/sidebar.tsx`

- [ ] **Step 1: Read current sidebar.tsx to find the navItems array**

- [ ] **Step 2: Add the Ask nav item**

Add to the `navItems` array (after Messages, before Settings):
```typescript
{
  label: 'Ask',
  href: '/dashboard/ask',
  icon: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  ),
  roles: ['doc', 'coach', 'parent'],
}
```

- [ ] **Step 3: Commit**

```bash
git add app-next/components/sidebar.tsx
git commit -m "feat: add Ask link to sidebar navigation"
```

---

### Task 9: End-to-end test

- [ ] **Step 1: Start dev server**

```bash
cd /Users/canci27/Desktop/offpitchos/app-next && npm run dev
```

- [ ] **Step 2: Verify the page loads**

Navigate to `http://localhost:3000/dashboard/ask`
- Confirm the page renders with title, suggestion buttons, and input field
- Confirm "Ask" appears in the sidebar

- [ ] **Step 3: Test asking a question**

Type "What's the schedule this week?" and submit.
- Confirm the question appears immediately (optimistic)
- Confirm the AI response appears after a few seconds
- Confirm the response references real club data

- [ ] **Step 4: Test suggestion buttons**

Click a suggestion button — confirm it populates the input field.

- [ ] **Step 5: Test DOC log (if logged in as DOC)**

Click "View AI Chat Log" — confirm recent Q&A entries appear.

- [ ] **Step 6: Test error handling**

Submit an empty question — confirm it's blocked by the disabled button.

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat: AI Assistant — parent FAQ page with Claude-powered answers"
```
