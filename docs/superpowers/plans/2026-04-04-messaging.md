# Messaging Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add in-app announcements with threaded replies so DOCs and coaches can communicate with team members without external tools.

**Architecture:** Two tables (announcements + announcement_replies). Announcements target a team or the whole club. Replies are flat threads. Notifications use the existing system with a new nullable `announcement_id` column.

**Tech Stack:** Next.js 14, Supabase (Postgres + RLS), Tailwind CSS 4, TypeScript. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-04-04-messaging-design.md`

**Note:** No test framework configured. Manual verification via dev server and build checks.

---

## File Structure

```
# New files
supabase/migrations/008_messaging.sql                          — announcements, announcement_replies, notification changes + RLS
app-next/app/dashboard/messages/page.tsx                       — Messages page (server component)
app-next/app/dashboard/messages/messages-client.tsx            — Client wrapper with announcement list + filters
app-next/app/dashboard/messages/announcement-card.tsx          — Single announcement card with expand/collapse
app-next/app/dashboard/messages/reply-thread.tsx               — Reply list + reply input
app-next/app/dashboard/messages/new-announcement-modal.tsx     — Create announcement modal
app-next/app/dashboard/messages/actions.ts                     — Server actions

# Modified files
app-next/components/sidebar.tsx                                — Enable Messages link
app-next/components/notification-bell.tsx                      — Route announcement notifications to /dashboard/messages
```

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/008_messaging.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- ============================================================
-- 008_messaging.sql — announcements, announcement_replies
-- ============================================================

-- --------------------------------------------------------
-- TABLES
-- --------------------------------------------------------

CREATE TABLE announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  team_id uuid REFERENCES teams(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE announcement_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  announcement_id uuid NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- --------------------------------------------------------
-- INDEXES
-- --------------------------------------------------------

CREATE INDEX idx_announcements_club_id ON announcements(club_id);
CREATE INDEX idx_announcements_team_id ON announcements(team_id) WHERE team_id IS NOT NULL;
CREATE INDEX idx_announcements_created ON announcements(created_at DESC);
CREATE INDEX idx_announcements_pinned ON announcements(pinned DESC, created_at DESC);
CREATE INDEX idx_replies_announcement ON announcement_replies(announcement_id);
CREATE INDEX idx_replies_created ON announcement_replies(created_at);

-- --------------------------------------------------------
-- TRIGGERS
-- --------------------------------------------------------

CREATE TRIGGER announcements_updated_at
  BEFORE UPDATE ON announcements
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

-- --------------------------------------------------------
-- NOTIFICATION TABLE CHANGES
-- --------------------------------------------------------

-- Make event_id nullable (notifications now serve non-event purposes)
ALTER TABLE notifications ALTER COLUMN event_id DROP NOT NULL;

-- Add announcement_id FK
ALTER TABLE notifications ADD COLUMN announcement_id uuid REFERENCES announcements(id) ON DELETE CASCADE;

-- Ensure every notification references either an event or an announcement
ALTER TABLE notifications ADD CONSTRAINT notifications_source_check
  CHECK (event_id IS NOT NULL OR announcement_id IS NOT NULL);

-- Update type CHECK to include messaging types
ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE notifications ADD CONSTRAINT notifications_type_check
  CHECK (type IN (
    'event_created', 'event_updated', 'event_cancelled',
    'coverage_requested', 'coverage_accepted', 'coverage_escalated',
    'announcement_posted', 'announcement_reply'
  ));

-- --------------------------------------------------------
-- RLS
-- --------------------------------------------------------

ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcement_replies ENABLE ROW LEVEL SECURITY;

-- announcements: DOC full CRUD
CREATE POLICY announcements_doc_all ON announcements FOR ALL
  USING (club_id IN (SELECT get_doc_club_ids()))
  WITH CHECK (club_id IN (SELECT get_doc_club_ids()));

-- announcements: coaches insert for their teams
CREATE POLICY announcements_coach_insert ON announcements FOR INSERT
  WITH CHECK (
    team_id IN (SELECT get_user_team_ids())
    AND club_id NOT IN (SELECT get_doc_club_ids())
    AND author_id IN (SELECT get_user_profile_ids())
  );

-- announcements: coaches update/delete own only
CREATE POLICY announcements_coach_update ON announcements FOR UPDATE
  USING (
    author_id IN (SELECT get_user_profile_ids())
    AND club_id NOT IN (SELECT get_doc_club_ids())
  )
  WITH CHECK (
    author_id IN (SELECT get_user_profile_ids())
    AND club_id NOT IN (SELECT get_doc_club_ids())
  );

CREATE POLICY announcements_coach_delete ON announcements FOR DELETE
  USING (
    author_id IN (SELECT get_user_profile_ids())
    AND club_id NOT IN (SELECT get_doc_club_ids())
  );

-- announcements: all members read (own teams + club-wide)
CREATE POLICY announcements_member_read ON announcements FOR SELECT
  USING (
    club_id IN (SELECT get_user_club_ids())
    AND (team_id IS NULL OR team_id IN (SELECT get_user_team_ids()))
  );

-- replies: all members read
CREATE POLICY replies_member_read ON announcement_replies FOR SELECT
  USING (announcement_id IN (
    SELECT id FROM announcements
    WHERE club_id IN (SELECT get_user_club_ids())
    AND (team_id IS NULL OR team_id IN (SELECT get_user_team_ids()))
  ));

-- replies: all members insert (must see parent announcement)
CREATE POLICY replies_member_insert ON announcement_replies FOR INSERT
  WITH CHECK (
    author_id IN (SELECT get_user_profile_ids())
    AND announcement_id IN (
      SELECT id FROM announcements
      WHERE club_id IN (SELECT get_user_club_ids())
      AND (team_id IS NULL OR team_id IN (SELECT get_user_team_ids()))
    )
  );

-- replies: DOC delete any, others delete own
CREATE POLICY replies_delete ON announcement_replies FOR DELETE
  USING (
    author_id IN (SELECT get_user_profile_ids())
    OR announcement_id IN (
      SELECT id FROM announcements WHERE club_id IN (SELECT get_doc_club_ids())
    )
  );
```

- [ ] **Step 2: Apply in Supabase SQL Editor**

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/008_messaging.sql
git commit -m "feat: add messaging schema — announcements, replies, notification changes with RLS"
```

---

## Task 2: Messaging Server Actions

**Files:**
- Create: `app-next/app/dashboard/messages/actions.ts`

- [ ] **Step 1: Create server actions**

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

// ---------- Actions ----------

export async function createAnnouncement(input: {
  teamId: string | null
  title: string
  body: string
}) {
  const { profile, supabase } = await getUserProfile()

  if (!input.title.trim() || !input.body.trim()) {
    throw new Error('Title and body are required')
  }

  const { data: announcement, error } = await supabase
    .from('announcements')
    .insert({
      club_id: profile.club_id!,
      team_id: input.teamId,
      author_id: profile.id,
      title: input.title.trim(),
      body: input.body.trim(),
    })
    .select('id')
    .single()

  if (error) throw new Error(`Failed to create announcement: ${error.message}`)

  // Notify team members (or all club members if club-wide)
  const service = createServiceClient()

  const { data: authorProfile } = await service
    .from('profiles')
    .select('display_name')
    .eq('id', profile.id)
    .single()

  const authorName = authorProfile?.display_name ?? 'Someone'
  const message = `${authorName} posted: ${input.title.trim()}`

  let recipientIds: string[] = []

  if (input.teamId) {
    // Team-specific: notify team members
    const { data: members } = await service
      .from('team_members')
      .select('profile_id')
      .eq('team_id', input.teamId)

    recipientIds = (members ?? [])
      .map(m => m.profile_id)
      .filter(id => id !== profile.id)
  } else {
    // Club-wide: notify all club members
    const { data: members } = await service
      .from('profiles')
      .select('id')
      .eq('club_id', profile.club_id!)

    recipientIds = (members ?? [])
      .map(m => m.id)
      .filter(id => id !== profile.id)
  }

  if (recipientIds.length > 0) {
    const notifications = recipientIds.map(pid => ({
      profile_id: pid,
      announcement_id: announcement.id,
      type: 'announcement_posted',
      message,
    }))

    await service.from('notifications').insert(notifications)
  }

  revalidatePath('/dashboard/messages')
}

export async function createReply(announcementId: string, body: string) {
  const { profile, supabase } = await getUserProfile()

  if (!body.trim()) throw new Error('Reply cannot be empty')

  const { error } = await supabase
    .from('announcement_replies')
    .insert({
      announcement_id: announcementId,
      author_id: profile.id,
      body: body.trim(),
    })

  if (error) throw new Error(`Failed to post reply: ${error.message}`)

  // Notify announcement author
  const service = createServiceClient()

  const { data: announcement } = await service
    .from('announcements')
    .select('author_id, title')
    .eq('id', announcementId)
    .single()

  if (announcement && announcement.author_id !== profile.id) {
    const { data: replier } = await service
      .from('profiles')
      .select('display_name')
      .eq('id', profile.id)
      .single()

    await service.from('notifications').insert({
      profile_id: announcement.author_id,
      announcement_id: announcementId,
      type: 'announcement_reply',
      message: `${replier?.display_name ?? 'Someone'} replied to: ${announcement.title}`,
    })
  }

  revalidatePath('/dashboard/messages')
}

export async function togglePin(announcementId: string) {
  const { supabase } = await getUserProfile()

  const { data: current } = await supabase
    .from('announcements')
    .select('pinned')
    .eq('id', announcementId)
    .single()

  if (!current) throw new Error('Announcement not found')

  const { error } = await supabase
    .from('announcements')
    .update({ pinned: !current.pinned })
    .eq('id', announcementId)

  if (error) throw new Error(`Failed to toggle pin: ${error.message}`)

  revalidatePath('/dashboard/messages')
}

export async function deleteAnnouncement(announcementId: string) {
  const { supabase } = await getUserProfile()

  const { error } = await supabase
    .from('announcements')
    .delete()
    .eq('id', announcementId)

  if (error) throw new Error(`Failed to delete announcement: ${error.message}`)

  revalidatePath('/dashboard/messages')
}

export async function deleteReply(replyId: string) {
  const { supabase } = await getUserProfile()

  const { error } = await supabase
    .from('announcement_replies')
    .delete()
    .eq('id', replyId)

  if (error) throw new Error(`Failed to delete reply: ${error.message}`)

  revalidatePath('/dashboard/messages')
}

export async function getMessagesData() {
  const { profile, supabase } = await getUserProfile()

  const { data: announcements } = await supabase
    .from('announcements')
    .select(`
      id, team_id, title, body, pinned, created_at,
      author:profiles!announcements_author_id_fkey ( display_name ),
      teams ( name, age_group ),
      announcement_replies ( id )
    `)
    .eq('club_id', profile.club_id!)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })

  const { data: teams } = await supabase
    .from('teams')
    .select('id, name, age_group')
    .eq('club_id', profile.club_id!)
    .order('age_group')

  return {
    announcements: announcements ?? [],
    teams: teams ?? [],
    userRole: profile.role,
    userProfileId: profile.id,
  }
}

export async function getAnnouncementReplies(announcementId: string) {
  const { supabase } = await getUserProfile()

  const { data } = await supabase
    .from('announcement_replies')
    .select(`
      id, body, created_at,
      author:profiles!announcement_replies_author_id_fkey ( id, display_name )
    `)
    .eq('announcement_id', announcementId)
    .order('created_at', { ascending: true })

  return data ?? []
}
```

- [ ] **Step 2: Verify build**

```bash
cd /Users/canci27/Desktop/sidelineos/app-next && npm run build
```

- [ ] **Step 3: Commit**

```bash
git add app-next/app/dashboard/messages/actions.ts
git commit -m "feat: add messaging server actions — announcements, replies, notifications"
```

---

## Task 3: Messages Page UI

**Files:**
- Create: `app-next/app/dashboard/messages/reply-thread.tsx`
- Create: `app-next/app/dashboard/messages/announcement-card.tsx`
- Create: `app-next/app/dashboard/messages/new-announcement-modal.tsx`
- Create: `app-next/app/dashboard/messages/messages-client.tsx`
- Create: `app-next/app/dashboard/messages/page.tsx`

- [ ] **Step 1: Create reply-thread component**

Create `app-next/app/dashboard/messages/reply-thread.tsx`:

```typescript
'use client'

import { useState, useTransition, useEffect } from 'react'
import { getAnnouncementReplies, createReply, deleteReply } from './actions'

interface Reply {
  id: string
  body: string
  created_at: string
  author: { id: string; display_name: string | null }[] | null
}

interface ReplyThreadProps {
  announcementId: string
  userProfileId: string
  userRole: string
}

export default function ReplyThread({ announcementId, userProfileId, userRole }: ReplyThreadProps) {
  const [replies, setReplies] = useState<Reply[]>([])
  const [replyText, setReplyText] = useState('')
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    loadReplies()
  }, [announcementId])

  async function loadReplies() {
    const data = await getAnnouncementReplies(announcementId)
    setReplies(data)
  }

  function handleSubmitReply() {
    if (!replyText.trim()) return
    startTransition(async () => {
      await createReply(announcementId, replyText)
      setReplyText('')
      await loadReplies()
    })
  }

  function handleDelete(replyId: string) {
    startTransition(async () => {
      await deleteReply(replyId)
      await loadReplies()
    })
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

  function canDelete(reply: Reply): boolean {
    const authorId = Array.isArray(reply.author) ? reply.author[0]?.id : (reply.author as any)?.id
    return authorId === userProfileId || userRole === 'doc'
  }

  return (
    <div className="mt-4 border-t border-white/5 pt-4">
      {replies.length > 0 && (
        <div className="space-y-3 mb-4">
          {replies.map(reply => {
            const author = Array.isArray(reply.author) ? reply.author[0] : reply.author
            return (
              <div key={reply.id} className="flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">
                      {author?.display_name ?? 'Unknown'}
                    </span>
                    <span className="text-xs text-gray">{timeAgo(reply.created_at)}</span>
                  </div>
                  <p className="text-sm text-gray mt-1">{reply.body}</p>
                </div>
                {canDelete(reply) && (
                  <button
                    onClick={() => handleDelete(reply.id)}
                    disabled={isPending}
                    className="text-xs text-gray hover:text-red transition-colors shrink-0"
                  >
                    Delete
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="flex gap-2">
        <input
          type="text"
          value={replyText}
          onChange={e => setReplyText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmitReply() } }}
          placeholder="Write a reply..."
          className="flex-1 bg-dark border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-gray focus:outline-none focus:border-green transition-colors"
        />
        <button
          onClick={handleSubmitReply}
          disabled={isPending || !replyText.trim()}
          className="bg-green text-dark font-bold px-4 py-2.5 rounded-xl hover:opacity-90 transition-opacity text-sm disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isPending ? '…' : 'Reply'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create announcement-card component**

Create `app-next/app/dashboard/messages/announcement-card.tsx`:

```typescript
'use client'

import { useState, useTransition } from 'react'
import { togglePin, deleteAnnouncement } from './actions'
import ReplyThread from './reply-thread'

interface AnnouncementCardProps {
  announcement: {
    id: string
    team_id: string | null
    title: string
    body: string
    pinned: boolean
    created_at: string
    author: any
    teams: any
    announcement_replies: any[]
  }
  userProfileId: string
  userRole: string
}

export default function AnnouncementCard({ announcement, userProfileId, userRole }: AnnouncementCardProps) {
  const [expanded, setExpanded] = useState(false)
  const [isPending, startTransition] = useTransition()

  const author = Array.isArray(announcement.author) ? announcement.author[0] : announcement.author
  const team = Array.isArray(announcement.teams) ? announcement.teams[0] : announcement.teams
  const replyCount = announcement.announcement_replies?.length ?? 0
  const isDoc = userRole === 'doc'
  const isAuthor = author?.id === userProfileId || announcement.author?.id === userProfileId

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

  function handlePin() {
    startTransition(async () => {
      await togglePin(announcement.id)
    })
  }

  function handleDelete() {
    if (!confirm('Delete this announcement and all its replies?')) return
    startTransition(async () => {
      await deleteAnnouncement(announcement.id)
    })
  }

  // Truncate body for preview
  const preview = announcement.body.length > 150
    ? announcement.body.slice(0, 150) + '…'
    : announcement.body

  return (
    <div className={`bg-dark-secondary rounded-xl p-4 border ${announcement.pinned ? 'border-green/20' : 'border-white/5'} transition-colors`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setExpanded(!expanded)}>
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            {team ? (
              <span className="text-xs font-bold bg-green/10 text-green px-2 py-0.5 rounded-full">
                {team.age_group ?? team.name}
              </span>
            ) : (
              <span className="text-xs font-bold bg-white/10 text-white px-2 py-0.5 rounded-full">
                All Teams
              </span>
            )}
            {announcement.pinned && (
              <span className="text-xs text-green" title="Pinned">
                📌
              </span>
            )}
            <span className="text-xs text-gray">{timeAgo(announcement.created_at)}</span>
          </div>
          <p className="font-bold text-white">{announcement.title}</p>
          <p className="text-gray text-sm mt-1">
            {expanded ? announcement.body : preview}
          </p>
          <p className="text-xs text-gray mt-2">
            {author?.display_name ?? 'Unknown'} · {replyCount} repl{replyCount !== 1 ? 'ies' : 'y'}
          </p>
        </div>

        <div className="flex gap-2 shrink-0">
          {isDoc && (
            <button
              onClick={handlePin}
              disabled={isPending}
              className="text-gray hover:text-green text-sm transition-colors"
              title={announcement.pinned ? 'Unpin' : 'Pin'}
            >
              {announcement.pinned ? 'Unpin' : 'Pin'}
            </button>
          )}
          {(isDoc || isAuthor) && (
            <button
              onClick={handleDelete}
              disabled={isPending}
              className="text-gray hover:text-red text-sm transition-colors"
            >
              Delete
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <ReplyThread
          announcementId={announcement.id}
          userProfileId={userProfileId}
          userRole={userRole}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create new-announcement-modal component**

Create `app-next/app/dashboard/messages/new-announcement-modal.tsx`:

```typescript
'use client'

import { useState, useTransition } from 'react'
import { createAnnouncement } from './actions'

interface Team {
  id: string
  name: string
  age_group: string
}

interface NewAnnouncementModalProps {
  teams: Team[]
  userRole: string
  onClose: () => void
}

export default function NewAnnouncementModal({ teams, userRole, onClose }: NewAnnouncementModalProps) {
  const [teamId, setTeamId] = useState<string>('')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const isDoc = userRole === 'doc'

  function handleSubmit() {
    if (!title.trim() || !body.trim()) {
      setError('Title and message are required')
      return
    }
    if (!isDoc && !teamId) {
      setError('Select a team')
      return
    }
    setError(null)

    startTransition(async () => {
      try {
        await createAnnouncement({
          teamId: teamId || null,
          title: title.trim(),
          body: body.trim(),
        })
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
      <div className="bg-dark-secondary rounded-2xl p-8 w-full max-w-lg border border-white/10 shadow-2xl">
        <h2 className="text-xl font-bold mb-6">New Announcement</h2>

        <label className="block text-sm font-medium text-gray mb-2">Audience</label>
        <select
          value={teamId}
          onChange={e => setTeamId(e.target.value)}
          className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-green transition-colors appearance-none mb-4"
        >
          {isDoc && <option value="">All Teams</option>}
          {teams.map(t => (
            <option key={t.id} value={t.id}>{t.name} ({t.age_group})</option>
          ))}
        </select>

        <label className="block text-sm font-medium text-gray mb-2">Title</label>
        <input
          type="text"
          value={title}
          onChange={e => setTitle(e.target.value)}
          placeholder="e.g. Practice location change"
          className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray focus:outline-none focus:border-green transition-colors mb-4"
          autoFocus
        />

        <label className="block text-sm font-medium text-gray mb-2">Message</label>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          placeholder="Write your announcement..."
          rows={4}
          className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray focus:outline-none focus:border-green transition-colors mb-2 resize-none"
        />

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
            {isPending ? 'Posting…' : 'Post Announcement'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create messages-client wrapper**

Create `app-next/app/dashboard/messages/messages-client.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { ROLES } from '@/lib/constants'
import AnnouncementCard from './announcement-card'
import NewAnnouncementModal from './new-announcement-modal'

interface Team {
  id: string
  name: string
  age_group: string
}

interface MessagesClientProps {
  announcements: any[]
  teams: Team[]
  userRole: string
  userProfileId: string
}

export default function MessagesClient({ announcements, teams, userRole, userProfileId }: MessagesClientProps) {
  const [filterTeam, setFilterTeam] = useState<string>('')
  const [modalOpen, setModalOpen] = useState(false)

  const canPost = userRole === ROLES.DOC || userRole === ROLES.COACH

  const filtered = announcements.filter(a => {
    if (!filterTeam) return true
    if (filterTeam === 'club-wide') return a.team_id === null
    return a.team_id === filterTeam
  })

  return (
    <>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Messages</h1>
          <p className="text-gray text-sm mt-1">
            {filtered.length} announcement{filtered.length !== 1 ? 's' : ''}
          </p>
        </div>
        {canPost && (
          <button
            onClick={() => setModalOpen(true)}
            className="bg-green text-dark font-bold px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity text-sm"
          >
            + New Announcement
          </button>
        )}
      </div>

      <div className="mb-6">
        <select
          value={filterTeam}
          onChange={e => setFilterTeam(e.target.value)}
          className="bg-dark border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-green transition-colors appearance-none"
        >
          <option value="">All</option>
          <option value="club-wide">Club-Wide Only</option>
          {teams.map(t => (
            <option key={t.id} value={t.id}>{t.name} ({t.age_group})</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-dark-secondary rounded-2xl p-12 text-center border border-white/5">
          <p className="text-gray text-lg">No announcements yet.</p>
          <p className="text-gray text-sm mt-1">
            {canPost ? 'Post your first announcement to get started.' : 'Announcements from your coaches will appear here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(a => (
            <AnnouncementCard
              key={a.id}
              announcement={a}
              userProfileId={userProfileId}
              userRole={userRole}
            />
          ))}
        </div>
      )}

      {modalOpen && (
        <NewAnnouncementModal
          teams={teams}
          userRole={userRole}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  )
}
```

- [ ] **Step 5: Create messages page server component**

Create `app-next/app/dashboard/messages/page.tsx`:

```typescript
import { getMessagesData } from './actions'
import MessagesClient from './messages-client'

export default async function MessagesPage() {
  const data = await getMessagesData()

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <MessagesClient
        announcements={data.announcements}
        teams={data.teams}
        userRole={data.userRole}
        userProfileId={data.userProfileId}
      />
    </div>
  )
}
```

- [ ] **Step 6: Verify build**

```bash
cd /Users/canci27/Desktop/sidelineos/app-next && npm run build
```

- [ ] **Step 7: Commit**

```bash
git add app-next/app/dashboard/messages/
git commit -m "feat: add messages page with announcements, replies, and new announcement modal"
```

---

## Task 4: Sidebar + Notification Bell Updates

**Files:**
- Modify: `app-next/components/sidebar.tsx`
- Modify: `app-next/components/notification-bell.tsx`

- [ ] **Step 1: Enable Messages link in sidebar**

In `app-next/components/sidebar.tsx`, find:
```typescript
  { label: 'Messages', href: '/dashboard/messages', icon: <MessageIcon />, disabled: true },
```
Replace with:
```typescript
  { label: 'Messages', href: '/dashboard/messages', icon: <MessageIcon /> },
```

- [ ] **Step 2: Update notification bell routing**

In `app-next/components/notification-bell.tsx`, find the onClick handler that navigates to schedule:
```typescript
onClick={() => { markAsRead(n.id); setOpen(false); router.push('/dashboard/schedule') }}
```
Replace with smart routing based on notification type:
```typescript
onClick={() => {
  markAsRead(n.id)
  setOpen(false)
  if (n.type === 'announcement_posted' || n.type === 'announcement_reply') {
    router.push('/dashboard/messages')
  } else if (n.type?.startsWith('coverage_')) {
    router.push('/dashboard/coverage')
  } else {
    router.push('/dashboard/schedule')
  }
}}
```

Note: The notification query also needs to select the `type` field. Check the existing query — it already selects `type` in the `select` string.

- [ ] **Step 3: Verify build**

```bash
cd /Users/canci27/Desktop/sidelineos/app-next && npm run build
```

- [ ] **Step 4: Commit**

```bash
git add app-next/components/sidebar.tsx app-next/components/notification-bell.tsx
git commit -m "feat: enable Messages link, route notifications to correct pages"
```

---

## Task 5: Final Verification

- [ ] **Step 1: Run build**

```bash
cd /Users/canci27/Desktop/sidelineos/app-next && npm run build
```

Expected: Build succeeds. `/dashboard/messages` route appears.

- [ ] **Step 2: Full manual test flow**

1. Log in as DOC
2. Go to Messages → empty state shows "No announcements yet"
3. Click "+ New Announcement" → pick "All Teams", enter title + body, post
4. Announcement appears in the list with "All Teams" badge
5. Click the announcement → reply thread expands
6. Type a reply and submit → reply appears
7. Create another announcement targeting a specific team
8. Filter by team → only that team's announcement shows
9. Pin an announcement → it moves to the top with pin icon
10. Delete a reply → it disappears
11. Delete an announcement → it and all replies removed
12. Check notification bell → announcement notifications appear
13. Click an announcement notification → navigates to /dashboard/messages
14. Messages link in sidebar is active (no "Soon" badge)

- [ ] **Step 3: Commit any fixes**

If any issues found during testing, fix and commit with descriptive message.
