# OffPitchOS Messaging — Design Spec

## Overview

In-app messaging for OffPitchOS — announcements with threaded replies. DOCs and coaches post announcements to teams or the whole club, parents and coaches reply in threads. Replaces scattered GroupMe/text/email communication with one organized place.

This is sub-project 4A. AI auto-responses (4B) and email aggregation are future phases.

## Approach

**Announcements + Replies.** Two tables: `announcements` for posts with audience targeting, `announcement_replies` for threaded responses. Announcements can target a specific team or the whole club (team_id = null). Replies are flat (no nesting). Notifications use the existing system.

## Database Schema

### `announcements`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | default gen_random_uuid() |
| club_id | uuid FK → clubs.id ON DELETE CASCADE | |
| team_id | uuid FK → teams.id ON DELETE CASCADE | Nullable — null means club-wide |
| author_id | uuid FK → profiles.id ON DELETE CASCADE | Who posted |
| title | text NOT NULL | Short subject line |
| body | text NOT NULL | Full message content |
| pinned | boolean NOT NULL DEFAULT false | DOC can pin important announcements |
| created_at | timestamptz NOT NULL | default now() |
| updated_at | timestamptz NOT NULL | default now() |

**Triggers:**
- `announcements_updated_at BEFORE UPDATE` — reuses existing `update_updated_at()` function

**Indexes:**
- announcements(club_id)
- announcements(team_id) WHERE team_id IS NOT NULL
- announcements(created_at DESC)
- announcements(pinned DESC, created_at DESC) — for sorted listing with pinned at top

### `announcement_replies`

| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | default gen_random_uuid() |
| announcement_id | uuid FK → announcements.id ON DELETE CASCADE | |
| author_id | uuid FK → profiles.id ON DELETE CASCADE | |
| body | text NOT NULL | |
| created_at | timestamptz NOT NULL | default now() |

**Indexes:**
- announcement_replies(announcement_id)
- announcement_replies(created_at)

## Notification Types

Add to the existing `notifications.type` CHECK constraint:

| Type | Recipients | Message |
|------|-----------|---------|
| `announcement_posted` | All members of targeted team (or all club members if club-wide) | "[Author] posted: [Title]" |
| `announcement_reply` | Announcement author only | "[Replier] replied to your announcement: [Title]" |

**Notification schema change:** The migration must:
1. Make `event_id` nullable: `ALTER TABLE notifications ALTER COLUMN event_id DROP NOT NULL`
2. Add `announcement_id` column: `ALTER TABLE notifications ADD COLUMN announcement_id uuid REFERENCES announcements(id) ON DELETE CASCADE`
3. Add source check: `ALTER TABLE notifications ADD CONSTRAINT notifications_source_check CHECK (event_id IS NOT NULL OR announcement_id IS NOT NULL)`

This ensures every notification links to either an event or an announcement, and announcement notifications can navigate to the source.

## Row-Level Security

All policies use existing `SECURITY DEFINER` helper functions.

### `announcements`

```sql
-- DOC: full CRUD for their club
CREATE POLICY announcements_doc_all ON announcements FOR ALL
  USING (club_id IN (SELECT get_doc_club_ids()))
  WITH CHECK (club_id IN (SELECT get_doc_club_ids()));

-- Coaches: insert for their teams, update/delete own only
CREATE POLICY announcements_coach_insert ON announcements FOR INSERT
  WITH CHECK (
    team_id IN (SELECT get_user_team_ids())
    AND club_id NOT IN (SELECT get_doc_club_ids())
    AND author_id IN (SELECT get_user_profile_ids())
  );

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

-- All members: read announcements for their teams + club-wide
CREATE POLICY announcements_member_read ON announcements FOR SELECT
  USING (
    club_id IN (SELECT get_user_club_ids())
    AND (team_id IS NULL OR team_id IN (SELECT get_user_team_ids()))
  );
```

### `announcement_replies`

```sql
-- All members: read replies on announcements they can see
CREATE POLICY replies_member_read ON announcement_replies FOR SELECT
  USING (announcement_id IN (
    SELECT id FROM announcements
    WHERE club_id IN (SELECT get_user_club_ids())
    AND (team_id IS NULL OR team_id IN (SELECT get_user_team_ids()))
  ));

-- All members: post replies (must be able to see the parent announcement)
CREATE POLICY replies_member_insert ON announcement_replies FOR INSERT
  WITH CHECK (
    author_id IN (SELECT get_user_profile_ids())
    AND announcement_id IN (
      SELECT id FROM announcements
      WHERE club_id IN (SELECT get_user_club_ids())
      AND (team_id IS NULL OR team_id IN (SELECT get_user_team_ids()))
    )
  );

-- DOC can delete any reply in their club, others delete own only
CREATE POLICY replies_delete ON announcement_replies FOR DELETE
  USING (
    author_id IN (SELECT get_user_profile_ids())
    OR announcement_id IN (
      SELECT id FROM announcements WHERE club_id IN (SELECT get_doc_club_ids())
    )
  );
```

## Pages & UI

### `/dashboard/messages` — Messages Page

**Announcement list (default view):**
- Sorted by pinned first, then most recent
- Each card: author avatar/name, title, body preview (truncated to 2 lines), team badge (or "All Teams"), reply count, time ago
- Pinned announcements have a pin icon
- Filter by team (dropdown)
- "New Announcement" button (DOC + coaches)
- Click an announcement → expands inline to show full body + reply thread

**New Announcement Modal:**
- Audience: dropdown — "All Teams" or specific team (DOC sees all teams, coaches see their teams)
- Title: text input
- Body: textarea
- Post button

**Reply Thread (expanded inline):**
- Full announcement body at top
- Replies listed chronologically
- Each reply: author name, body, time ago, delete button (own replies or DOC)
- Text input + "Reply" button at bottom
- All users can reply

### Sidebar
- Enable the Messages link (remove `disabled: true`)

## Access Control

| Action | DOC | Coach | Parent |
|--------|-----|-------|--------|
| Create announcement (any team / club-wide) | Yes | No | No |
| Create announcement (own teams) | Yes | Yes | No |
| View announcements (own teams + club-wide) | Yes | Yes | Yes |
| Reply to announcements | Yes | Yes | Yes |
| Pin/unpin announcements | Yes | No | No |
| Delete announcements | Yes | Own only | No |
| Delete replies | Yes | Own only | Own only |

## What's NOT in This Phase

- AI auto-responses to parent questions (sub-project 4B)
- Email integration / aggregation
- Real-time updates (polling or websockets)
- Rich text / markdown in messages
- File attachments / images
- Read receipts
- Unread count badge on sidebar
- Message search
- Direct messages (1-on-1)

## File Structure

```
supabase/migrations/
└── 008_messaging.sql                              # announcements, announcement_replies, notification changes + RLS

app-next/lib/constants.ts                           # (modify) No new constants needed — announcement types are simple strings

app-next/app/dashboard/messages/
├── page.tsx                                        # Messages page (server component)
├── messages-client.tsx                             # Client wrapper with announcement list + filters
├── announcement-card.tsx                           # Single announcement card with expand/collapse
├── reply-thread.tsx                                # Reply list + reply input (shown when expanded)
├── new-announcement-modal.tsx                      # Create announcement modal
└── actions.ts                                      # Server actions (CRUD announcements/replies, notifications)

app-next/components/
└── sidebar.tsx                                     # (modify) Enable Messages link
```
