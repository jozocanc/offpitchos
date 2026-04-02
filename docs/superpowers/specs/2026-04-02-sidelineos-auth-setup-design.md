# SidelineOS Auth + Project Setup — Design Spec

## Overview

Foundation layer for the SidelineOS web app — a Next.js + Supabase application with authentication, role-based access, club onboarding, invite system, and the DOC dashboard shell. This is Sub-project 1 of 4. Subsequent sub-projects (Scheduling, Coach Coverage, Communication Hub) build on this foundation.

- **Tech stack:** Next.js 14 (App Router), Supabase (Postgres + Auth), Tailwind CSS
- **Hosting:** Vercel
- **Repo:** Separate Next.js app in a new directory or the existing `sidelineos` repo alongside the landing page

## Tech Stack Details

| Tool | Purpose |
|------|---------|
| Next.js 14 (App Router) | React framework with server components, API routes, middleware |
| Supabase | Postgres database, auth (email + Google OAuth), row-level security |
| Tailwind CSS | Utility-first CSS, configured with SidelineOS brand tokens |
| Vercel | Hosting, auto-deploy from GitHub |

## Brand Tokens (Tailwind Config)

| Token | Value | Usage |
|-------|-------|-------|
| `dark` | `#0A1628` | Page/sidebar background |
| `dark-secondary` | `#12203A` | Card backgrounds, input backgrounds |
| `green` | `#00FF87` | Accents, CTAs, active states |
| `white` | `#FFFFFF` | Primary text |
| `gray` | `#94A3B8` | Secondary text, labels |
| `red` | `#FF6B6B` | Errors, alerts |
| Font | Inter | All text |

## Authentication

### Methods
- **Google OAuth** — primary, one-click login via Supabase Auth
- **Email + Password** — fallback for users without Google accounts

### Roles
Three user roles stored in the `profiles` table:
- `doc` — Director of Coaching. Full access to all club features.
- `coach` — Team-level access. Sees assigned teams, schedules, player profiles.
- `parent` — Limited access. Sees team schedule, chat, attendance, camp info.

### Auth Flow
1. User visits `/login` or `/signup`
2. Chooses Google or email/password
3. Supabase Auth handles the session (JWT stored in cookie via `@supabase/ssr`)
4. On first login, check if `profiles` record exists:
   - If no profile → redirect to `/onboarding` (new DOC) or auto-create profile with invite role (coach/parent joining via invite)
   - If profile exists → redirect to `/dashboard`
5. Next.js middleware checks auth on every protected route. Unauthenticated users redirect to `/login`.

### Route Protection
- Public routes: `/login`, `/signup`, `/join/[token]` (invite link)
- Protected routes: everything else
- Role-based access: middleware checks `profile.role` and restricts routes per role

## DOC Onboarding

### Hybrid Wizard (2 steps + dashboard)

**Step 1: Club Setup**
- Input: Club name
- Creates `clubs` record with DOC as owner

**Step 2: First Team**
- Inputs: Team name, age group (dropdown: U8, U9, U10, U11, U12, U13, U14, U15, U16, U17, U18, U19)
- Creates `teams` record linked to club

**After wizard:** Redirect to `/dashboard` with guided prompt cards:
- "Invite your first coach" → links to invite flow
- "Share team link with parents" → generates shareable link

## Invite System

### Coach Invites (Email)
1. DOC enters coach's email from the dashboard or team page
2. System creates `invites` record (role: `coach`, linked to club)
3. Email sent via Supabase's built-in email or a transactional email service
4. Coach clicks link → `/join/[token]` → signs up → profile created with `coach` role → added to club

### Parent Invites (Shareable Link)
1. DOC generates a team invite link from the team page
2. Link format: `/join/[token]` where token maps to a specific team + `parent` role
3. DOC shares link in existing group chats (GroupMe, WhatsApp, etc.)
4. Parent clicks link → signs up → profile created with `parent` role → added to team

### Invite Rules
- Invites expire after 7 days
- DOC can revoke or resend invites
- One invite per email per club (prevent duplicates)
- Invite tokens are UUIDs (not guessable)

## Dashboard Layout

### Sidebar Navigation (All Roles)
Left sidebar, collapsible to icon-only on desktop, hamburger menu on mobile.

**DOC sidebar items:**
- Dashboard (home)
- Teams
- Schedule (placeholder for Sub-project 2)
- Coaches
- Messages (placeholder for Sub-project 4)
- Settings

**Coach sidebar items:**
- Dashboard
- My Teams
- Schedule (placeholder)
- Messages (placeholder)

**Parent sidebar items:**
- Dashboard
- Team
- Schedule (placeholder)
- Messages (placeholder)

### DOC Dashboard Content
- **Welcome header** with DOC name
- **Stat cards row:** Total teams, Today's sessions (placeholder: 0), Coverage alerts (placeholder: 0)
- **Upcoming events list** (placeholder: "No events yet — add your first schedule")
- **Quick action cards** (during early setup): "Invite a coach", "Share team link"

### Coach Dashboard Content
- **Welcome header** with coach name
- **My Teams list** — teams they're assigned to
- **Upcoming events** (placeholder)

### Parent Dashboard Content
- **Welcome header**
- **Team info** — team name, next event (placeholder)
- **Announcements** (placeholder)

## Database Schema (Supabase/Postgres)

### `clubs`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key, default `gen_random_uuid()` |
| name | text | Club name |
| created_by | uuid | References `auth.users(id)` |
| created_at | timestamptz | Default `now()` |

### `teams`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| club_id | uuid | References `clubs(id)` |
| name | text | Team name (e.g. "U14 Boys") |
| age_group | text | e.g. "U14" |
| created_at | timestamptz | Default `now()` |

### `profiles`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| user_id | uuid | References `auth.users(id)`, unique |
| club_id | uuid | References `clubs(id)` |
| role | text | `doc`, `coach`, or `parent` |
| display_name | text | User's display name |
| created_at | timestamptz | Default `now()` |

### `team_members`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| team_id | uuid | References `teams(id)` |
| profile_id | uuid | References `profiles(id)` |
| role | text | Role within team context |
| created_at | timestamptz | Default `now()` |

Unique constraint on `(team_id, profile_id)`.

### `invites`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | Primary key |
| club_id | uuid | References `clubs(id)` |
| team_id | uuid | References `teams(id)`, nullable (club-wide invites for coaches) |
| email | text | Nullable (null for link-based invites) |
| role | text | `coach` or `parent` |
| token | uuid | Unique, used in invite URL |
| expires_at | timestamptz | 7 days from creation |
| accepted_at | timestamptz | Nullable, set when invite is used |
| created_at | timestamptz | Default `now()` |

### Row-Level Security (RLS)
- `clubs`: DOC can read/write their own club. Coaches and parents can read their club.
- `teams`: DOC can CRUD all teams in their club. Coaches/parents can read teams they belong to.
- `profiles`: Users can read/update their own profile. DOC can read all profiles in their club.
- `team_members`: DOC can CRUD. Coaches/parents can read their own team memberships.
- `invites`: DOC can CRUD invites for their club. Public read on token lookup for the join flow.

## Pages

| Route | Access | Description |
|-------|--------|-------------|
| `/login` | Public | Google + email/password sign in |
| `/signup` | Public | Google + email/password sign up |
| `/join/[token]` | Public | Invite acceptance — sign up with pre-set role |
| `/onboarding` | Authenticated (new DOC) | Club name + first team wizard |
| `/dashboard` | Authenticated | Role-specific dashboard home |
| `/teams` | DOC, Coach | Team list |
| `/teams/[id]` | DOC, Coach, Parent (own team) | Team detail — roster, invite link |
| `/settings` | DOC | Club settings, manage invites |

## File Structure

```
app/
  (auth)/
    login/page.tsx          — login form
    signup/page.tsx         — signup form
    join/[token]/page.tsx   — invite acceptance
  (protected)/
    layout.tsx              — sidebar + auth check wrapper
    dashboard/page.tsx      — role-based dashboard
    onboarding/page.tsx     — club setup wizard
    teams/
      page.tsx              — team list
      [id]/page.tsx         — team detail
    settings/page.tsx       — club settings
  layout.tsx                — root layout (fonts, providers)
  page.tsx                  — redirect to /dashboard or /login
components/
  sidebar.tsx               — sidebar navigation
  stat-card.tsx             — dashboard stat card
  team-card.tsx             — team list card
  invite-form.tsx           — email invite form
  invite-link.tsx           — shareable link generator
lib/
  supabase/
    client.ts               — browser Supabase client
    server.ts               — server Supabase client
    middleware.ts            — auth middleware helper
  constants.ts              — role definitions, age groups
middleware.ts               — Next.js middleware (auth + role checks)
tailwind.config.ts          — brand tokens
```

## Out of Scope (for this sub-project)

- Scheduling functionality (Sub-project 2)
- Coach coverage system (Sub-project 3)
- Communication hub / messaging (Sub-project 4)
- Player development profiles
- Camp management
- Voice commands
- Push notifications
- Any mobile-specific features
