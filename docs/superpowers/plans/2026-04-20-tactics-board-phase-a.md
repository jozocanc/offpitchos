# Tactics Board — Phase A Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the core tactics board — library page, interactive editor with players/cones/ball/goals/arrows/zones, formation templates, auto-save, PNG export, schedule-event attachment, and role gating — plus the read-only view for phones.

**Architecture:** Next.js App Router routes at `/dashboard/tactics`. Konva (`react-konva`) renders the field and all objects. Drill documents are JSONB in a new `drills` table with RLS. Server-rendered thumbnails via `@napi-rs/canvas` upload to Supabase Storage. The schedule event modal grows a new **Session plan** section that attaches drills via the `event_drills` join table.

**Tech Stack:** Next.js (App Router), React, TypeScript, Tailwind, Supabase (Postgres + Storage + RLS), Konva + react-konva, @napi-rs/canvas, Zod.

**Spec:** `docs/superpowers/specs/2026-04-20-tactics-board-design.md`

**Testing approach:** This codebase has no unit-test framework — verification is TypeScript (`tsc`), lint (`eslint`), `next build`, and manual QA in the running dev server (and on a preview deploy) against the three test accounts (DOC / coach / parent). Each task that touches user-facing behavior ends with a manual QA checklist.

---

## File Structure

| File | Responsibility |
|------|---------------|
| `supabase/migrations/023_tactics_board.sql` | New tables `drills` + `event_drills`, RLS, `drill-thumbnails` storage bucket |
| `app-next/lib/tactics/object-schema.ts` | Zod schemas for `BoardObject`, `Field`, `Drill` — single source of truth |
| `app-next/lib/tactics/field-templates.ts` | Formation templates (4-4-2, 4-3-3, etc.) — returns `BoardObject[]` |
| `app-next/lib/tactics/drill-categories.ts` | Category enum + display labels |
| `app-next/lib/tactics/field-renderer.tsx` | Shared Konva `Stage` + field component — used by editor, readonly, thumbnail |
| `app-next/lib/tactics/thumbnail.ts` | Server-side PNG rendering with `@napi-rs/canvas` |
| `app-next/components/sidebar.tsx` | Add `Tactics` nav item |
| `app-next/app/dashboard/tactics/page.tsx` | Library server component (RLS-scoped list) |
| `app-next/app/dashboard/tactics/library-client.tsx` | Filters, grid, card interactions |
| `app-next/app/dashboard/tactics/actions.ts` | Server actions: create/duplicate/delete/updateVisibility |
| `app-next/app/dashboard/tactics/loading.tsx` | Skeleton |
| `app-next/app/dashboard/tactics/new/page.tsx` | Creates blank drill → redirects to editor |
| `app-next/app/dashboard/tactics/[drillId]/page.tsx` | Editor server shell (loads drill, enforces RLS, branches on `?readonly=1`) |
| `app-next/app/dashboard/tactics/[drillId]/editor-client.tsx` | Full editor: palette + canvas + props panel + toolbar |
| `app-next/app/dashboard/tactics/[drillId]/readonly-view.tsx` | Phone/tablet read-only canvas + title + description |
| `app-next/app/dashboard/tactics/[drillId]/actions.ts` | saveDrill (auto-save), regenerateThumbnail |
| `app-next/app/dashboard/schedule/session-plan.tsx` | New section rendered inside `event-modal.tsx` |
| `app-next/app/dashboard/schedule/actions.ts` | Extend with `attachDrill`, `detachDrill`, `reorderDrills`, `updateAttachment` |
| `app-next/app/dashboard/schedule/event-modal.tsx` | Modify — mount `<SessionPlan />` for `doc`/`coach` |

---

### Task 1: Install Konva + canvas dependencies

**Files:**
- Modify: `app-next/package.json`, `app-next/package-lock.json`

- [ ] **Step 1: Install runtime deps**

```bash
cd /Users/canci27/Desktop/offpitchos/app-next && npm install konva react-konva @napi-rs/canvas
```

- [ ] **Step 2: Verify `next build` still works**

```bash
cd /Users/canci27/Desktop/offpitchos/app-next && npm run build
```

Expected: build completes without errors. If `@napi-rs/canvas` complains about platform binaries, check the `node_modules/@napi-rs/canvas-darwin-arm64` folder exists (it uses optional dependencies for platform binaries).

- [ ] **Step 3: Commit**

```bash
cd /Users/canci27/Desktop/offpitchos && git add app-next/package.json app-next/package-lock.json
git commit -m "chore(tactics): install konva + @napi-rs/canvas"
```

---

### Task 2: Database migration — drills + event_drills

**Files:**
- Create: `supabase/migrations/023_tactics_board.sql`

- [ ] **Step 1: Write the migration**

```sql
-- ============================================================
-- 023_tactics_board.sql — Tactics Board Phase A
--
-- drills: coach-authored drill diagrams with visibility scoping
-- event_drills: join table attaching drills to schedule events
-- drill-thumbnails: storage bucket for PNG previews
-- ============================================================

create table drills (
  id uuid primary key default gen_random_uuid(),
  club_id uuid not null references clubs(id) on delete cascade,
  team_id uuid references teams(id) on delete cascade,
  created_by uuid not null references profiles(id) on delete cascade,
  title text not null default 'Untitled drill',
  description text not null default '',
  category text not null default 'other'
    check (category in ('rondo','build-up','pressing','finishing','warm-up','ssg','transition','other')),
  visibility text not null default 'private'
    check (visibility in ('private','team','club')),
  field jsonb not null default '{"width_m":40,"length_m":60,"units":"m","orientation":"horizontal","half_field":true,"style":"schematic"}'::jsonb,
  objects jsonb not null default '[]'::jsonb,
  thumbnail_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_drills_club_team_updated on drills(club_id, team_id, updated_at desc);
create index idx_drills_creator_updated on drills(created_by, updated_at desc);
create index idx_drills_category on drills(club_id, category);

create or replace function touch_drills_updated_at() returns trigger as $$
begin new.updated_at = now(); return new; end;
$$ language plpgsql;

create trigger trg_drills_updated
  before update on drills
  for each row execute function touch_drills_updated_at();

create table event_drills (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  drill_id uuid not null references drills(id) on delete cascade,
  order_index int not null default 0,
  duration_minutes int not null default 15 check (duration_minutes > 0),
  coach_notes text,
  created_at timestamptz not null default now()
);

create index idx_event_drills_event_order on event_drills(event_id, order_index);

alter table drills enable row level security;
alter table event_drills enable row level security;

-- Helper: return the caller's profile (role + club_id)
-- (Project already has similar helpers; reuse if present)
create or replace function drills_caller_profile() returns table(profile_id uuid, role text, club_id uuid)
  language sql stable security definer set search_path = public as $$
  select id, role, club_id from profiles where user_id = auth.uid() limit 1;
$$;

-- Helper: is caller rostered to team?
create or replace function drills_is_rostered(p_team_id uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from team_members tm
    join profiles p on p.id = tm.profile_id
    where tm.team_id = p_team_id and p.user_id = auth.uid()
  );
$$;

-- SELECT: creator OR club-wide visible OR team-visible and rostered (or doc)
create policy drills_select on drills for select using (
  exists (
    select 1 from drills_caller_profile() cp
    where cp.role in ('doc','coach') and cp.club_id = drills.club_id and (
      drills.created_by = cp.profile_id
      or (drills.visibility = 'club')
      or (drills.visibility = 'team' and drills.team_id is not null
          and (cp.role = 'doc' or drills_is_rostered(drills.team_id)))
    )
  )
);

-- INSERT: doc or coach in same club; team_id null requires doc; otherwise doc or rostered
create policy drills_insert on drills for insert with check (
  exists (
    select 1 from drills_caller_profile() cp
    where cp.role in ('doc','coach')
      and cp.club_id = drills.club_id
      and cp.profile_id = drills.created_by
      and (
        (drills.team_id is null and cp.role = 'doc')
        or (drills.team_id is not null and (cp.role = 'doc' or drills_is_rostered(drills.team_id)))
      )
  )
);

-- UPDATE: creator, doc in same club, or rostered coach on non-private drill
create policy drills_update on drills for update using (
  exists (
    select 1 from drills_caller_profile() cp
    where cp.role in ('doc','coach') and cp.club_id = drills.club_id and (
      drills.created_by = cp.profile_id
      or cp.role = 'doc'
      or (cp.role = 'coach' and drills.visibility <> 'private'
          and drills.team_id is not null and drills_is_rostered(drills.team_id))
    )
  )
);

-- DELETE: creator or doc
create policy drills_delete on drills for delete using (
  exists (
    select 1 from drills_caller_profile() cp
    where cp.club_id = drills.club_id and (
      drills.created_by = cp.profile_id or cp.role = 'doc'
    )
  )
);

-- event_drills: can read if you can read the drill + you're doc/coach on the event's team
create policy event_drills_select on event_drills for select using (
  exists (
    select 1 from events e
    join teams t on t.id = e.team_id
    join drills_caller_profile() cp on cp.club_id = t.club_id
    where e.id = event_drills.event_id and cp.role in ('doc','coach')
      and (cp.role = 'doc' or drills_is_rostered(t.id))
  )
);

create policy event_drills_write on event_drills for all using (
  exists (
    select 1 from events e
    join teams t on t.id = e.team_id
    join drills_caller_profile() cp on cp.club_id = t.club_id
    where e.id = event_drills.event_id and cp.role in ('doc','coach')
      and (cp.role = 'doc' or drills_is_rostered(t.id))
  )
) with check (
  exists (
    select 1 from events e
    join teams t on t.id = e.team_id
    join drills_caller_profile() cp on cp.club_id = t.club_id
    where e.id = event_drills.event_id and cp.role in ('doc','coach')
      and (cp.role = 'doc' or drills_is_rostered(t.id))
  )
);

-- Storage bucket + policies
insert into storage.buckets (id, name, public)
values ('drill-thumbnails', 'drill-thumbnails', true)
on conflict (id) do nothing;

create policy drill_thumbs_read on storage.objects for select
  using (bucket_id = 'drill-thumbnails');

create policy drill_thumbs_write on storage.objects for insert
  with check (
    bucket_id = 'drill-thumbnails'
    and exists (
      select 1 from drills_caller_profile() cp
      where cp.role in ('doc','coach')
        and (storage.foldername(name))[1] = cp.club_id::text
    )
  );

create policy drill_thumbs_update on storage.objects for update
  using (
    bucket_id = 'drill-thumbnails'
    and exists (
      select 1 from drills_caller_profile() cp
      where cp.role in ('doc','coach')
        and (storage.foldername(name))[1] = cp.club_id::text
    )
  );

create policy drill_thumbs_delete on storage.objects for delete
  using (
    bucket_id = 'drill-thumbnails'
    and exists (
      select 1 from drills_caller_profile() cp
      where cp.role in ('doc','coach')
        and (storage.foldername(name))[1] = cp.club_id::text
    )
  );
```

> **Note:** If `drills_caller_profile` or `drills_is_rostered` collide with existing helpers in the schema (check `003_fix_all_rls_recursion.sql` and `004_fix_recursion_with_functions.sql`), prefix-rename these or reuse existing ones.

- [ ] **Step 2: Check for name collisions**

```bash
grep -n "caller_profile\|is_rostered" /Users/canci27/Desktop/offpitchos/supabase/migrations/*.sql
```

If similar helpers already exist, reuse them and delete the new ones from the migration.

- [ ] **Step 3: Apply migration via Supabase MCP**

Use the Supabase MCP tool `apply_migration` with name `023_tactics_board` and the SQL contents above. Verify with `list_tables` that `drills` and `event_drills` appear.

- [ ] **Step 4: Smoke-test RLS**

```sql
-- As a parent user, this must return zero rows even after drills exist:
select count(*) from drills;
-- As a doc in club X, this must return drills in club X only:
select count(*) from drills where club_id != '<different-club-id>';
```

Use MCP `execute_sql` impersonating each role (via service client) to verify.

- [ ] **Step 5: Commit**

```bash
cd /Users/canci27/Desktop/offpitchos && git add supabase/migrations/023_tactics_board.sql
git commit -m "feat(tactics): schema for drills + event_drills + RLS"
```

---

### Task 3: Object schema + types

**Files:**
- Create: `app-next/lib/tactics/object-schema.ts`
- Create: `app-next/lib/tactics/drill-categories.ts`

- [ ] **Step 1: Write `drill-categories.ts`**

```ts
export const DRILL_CATEGORIES = [
  'rondo','build-up','pressing','finishing','warm-up','ssg','transition','other',
] as const
export type DrillCategory = typeof DRILL_CATEGORIES[number]

export const DRILL_CATEGORY_LABELS: Record<DrillCategory, string> = {
  'rondo': 'Rondo',
  'build-up': 'Build-up',
  'pressing': 'Pressing',
  'finishing': 'Finishing',
  'warm-up': 'Warm-up',
  'ssg': 'Small-sided game',
  'transition': 'Transition',
  'other': 'Other',
}

export const VISIBILITIES = ['private','team','club'] as const
export type Visibility = typeof VISIBILITIES[number]
```

- [ ] **Step 2: Write `object-schema.ts`**

```ts
import { z } from 'zod'
import { DRILL_CATEGORIES, VISIBILITIES } from './drill-categories'

export const PlayerRole = z.enum(['red','blue','neutral','outside','gk','coach'])
export const ConeColor = z.enum(['orange','yellow','red','blue','white'])
export const GoalVariant = z.enum(['mini-h','mini-v','full'])
export const ArrowStyle = z.enum(['pass','run','free'])

const base = { id: z.string().min(1) }

export const PlayerObject = z.object({
  ...base, type: z.literal('player'),
  x: z.number(), y: z.number(),
  role: PlayerRole,
  number: z.number().int().min(0).max(99).optional(),
  position: z.string().max(8).optional(),
})

export const ConeObject = z.object({
  ...base, type: z.literal('cone'),
  x: z.number(), y: z.number(),
  color: ConeColor,
})

export const BallObject = z.object({
  ...base, type: z.literal('ball'),
  x: z.number(), y: z.number(),
})

export const GoalObject = z.object({
  ...base, type: z.literal('goal'),
  x: z.number(), y: z.number(),
  variant: GoalVariant,
  rotation: z.number().optional(),
})

export const ArrowObject = z.object({
  ...base, type: z.literal('arrow'),
  points: z.array(z.number()).min(4),
  style: ArrowStyle,
  thickness: z.number().min(1).max(8).optional(),
})

export const ZoneObject = z.object({
  ...base, type: z.literal('zone'),
  x: z.number(), y: z.number(),
  width: z.number().positive(), height: z.number().positive(),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
  opacity: z.number().min(0).max(1),
  label: z.string().max(40).optional(),
})

export const ZoneLineObject = z.object({
  ...base, type: z.literal('zone-line'),
  points: z.tuple([z.number(), z.number(), z.number(), z.number()]),
  color: z.string().regex(/^#[0-9a-f]{6}$/i),
})

export const BoardObject = z.discriminatedUnion('type', [
  PlayerObject, ConeObject, BallObject, GoalObject,
  ArrowObject, ZoneObject, ZoneLineObject,
])
export type BoardObject = z.infer<typeof BoardObject>

export const FieldSchema = z.object({
  width_m: z.number().positive().max(120),
  length_m: z.number().positive().max(120),
  units: z.enum(['m','yd']),
  orientation: z.enum(['horizontal','vertical']),
  half_field: z.boolean(),
  style: z.enum(['schematic','realistic']),
})
export type Field = z.infer<typeof FieldSchema>

export const DrillDocSchema = z.object({
  field: FieldSchema,
  objects: z.array(BoardObject),
})
export type DrillDoc = z.infer<typeof DrillDocSchema>

export const DrillRowSchema = z.object({
  id: z.string().uuid(),
  club_id: z.string().uuid(),
  team_id: z.string().uuid().nullable(),
  created_by: z.string().uuid(),
  title: z.string(),
  description: z.string(),
  category: z.enum(DRILL_CATEGORIES),
  visibility: z.enum(VISIBILITIES),
  field: FieldSchema,
  objects: z.array(BoardObject),
  thumbnail_path: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type DrillRow = z.infer<typeof DrillRowSchema>
```

- [ ] **Step 3: Verify type-check**

```bash
cd /Users/canci27/Desktop/offpitchos/app-next && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /Users/canci27/Desktop/offpitchos && git add app-next/lib/tactics/
git commit -m "feat(tactics): Zod object schema + category enums"
```

---

### Task 4: Sidebar item

**Files:**
- Modify: `app-next/components/sidebar.tsx`

- [ ] **Step 1: Add `TacticsIcon` SVG component**

Insert after the `CoverageIcon` function:

```tsx
function TacticsIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="5" width="20" height="14" rx="1" />
      <line x1="12" y1="5" x2="12" y2="19" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M2 9h3v6H2" />
      <path d="M22 9h-3v6h3" />
    </svg>
  )
}
```

- [ ] **Step 2: Add nav item between Coverage and Coaches**

```tsx
  { label: 'Coverage', href: '/dashboard/coverage', icon: <CoverageIcon />, roles: ['doc', 'coach'] },
  { label: 'Tactics', href: '/dashboard/tactics', icon: <TacticsIcon />, roles: ['doc', 'coach'] },
  { label: 'Coaches', href: '/dashboard/coaches', icon: <CoachesIcon />, roles: ['doc'] },
```

- [ ] **Step 3: Run dev server + QA**

```bash
cd /Users/canci27/Desktop/offpitchos/app-next && npm run dev
```

Open http://localhost:3000/dashboard in each role (use the admin role-switcher):
- DOC view: **Tactics** appears between Coverage and Coaches ✅
- Coach view: **Tactics** appears ✅
- Parent view: **Tactics** is hidden ✅

Clicking Tactics 404s — that's expected until Task 5.

- [ ] **Step 4: Commit**

```bash
cd /Users/canci27/Desktop/offpitchos && git add app-next/components/sidebar.tsx
git commit -m "feat(tactics): add Tactics nav item for doc + coach"
```

---

### Task 5: Library route + server actions (list, create blank)

**Files:**
- Create: `app-next/app/dashboard/tactics/page.tsx`
- Create: `app-next/app/dashboard/tactics/loading.tsx`
- Create: `app-next/app/dashboard/tactics/actions.ts`
- Create: `app-next/app/dashboard/tactics/new/page.tsx`

- [ ] **Step 1: Write `actions.ts` — listing + create blank + delete + duplicate + updateVisibility**

```ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { DrillRow, DrillRowSchema, FieldSchema } from '@/lib/tactics/object-schema'
import type { DrillCategory, Visibility } from '@/lib/tactics/drill-categories'

export interface DrillSummary {
  id: string
  title: string
  category: DrillCategory
  visibility: Visibility
  teamId: string | null
  teamName: string | null
  createdById: string
  createdByName: string | null
  thumbnailUrl: string | null
  updatedAt: string
  canEdit: boolean
  canDelete: boolean
}

export async function listDrills(filters?: {
  teamId?: string | 'all' | 'none'
  category?: DrillCategory | 'all'
  visibility?: Visibility | 'mine' | 'all'
  search?: string
}): Promise<DrillSummary[]> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, club_id')
    .eq('user_id', user.id)
    .single()
  if (!profile?.club_id) return []

  let q = supabase
    .from('drills')
    .select('id, title, category, visibility, team_id, created_by, thumbnail_path, updated_at')
    .eq('club_id', profile.club_id)
    .order('updated_at', { ascending: false })

  if (filters?.teamId === 'none') q = q.is('team_id', null)
  else if (filters?.teamId && filters.teamId !== 'all') q = q.eq('team_id', filters.teamId)
  if (filters?.category && filters.category !== 'all') q = q.eq('category', filters.category)
  if (filters?.visibility === 'mine') q = q.eq('created_by', profile.id)
  else if (filters?.visibility && filters.visibility !== 'all') q = q.eq('visibility', filters.visibility)
  if (filters?.search) q = q.ilike('title', `%${filters.search}%`)

  const { data } = await q
  if (!data) return []

  const teamIds = Array.from(new Set(data.map(d => d.team_id).filter(Boolean))) as string[]
  const creatorIds = Array.from(new Set(data.map(d => d.created_by)))
  const [teamsRes, profilesRes] = await Promise.all([
    teamIds.length ? supabase.from('teams').select('id, name').in('id', teamIds) : Promise.resolve({ data: [] as { id: string, name: string }[] }),
    supabase.from('profiles').select('id, display_name').in('id', creatorIds),
  ])
  const teamById = new Map((teamsRes.data ?? []).map(t => [t.id, t.name]))
  const nameById = new Map((profilesRes.data ?? []).map(p => [p.id, p.display_name]))

  return data.map(d => ({
    id: d.id,
    title: d.title,
    category: d.category,
    visibility: d.visibility,
    teamId: d.team_id,
    teamName: d.team_id ? teamById.get(d.team_id) ?? null : null,
    createdById: d.created_by,
    createdByName: nameById.get(d.created_by) ?? null,
    thumbnailUrl: d.thumbnail_path
      ? `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/drill-thumbnails/${d.thumbnail_path}`
      : null,
    updatedAt: d.updated_at,
    canEdit: d.created_by === profile.id || profile.role === 'doc',
    canDelete: d.created_by === profile.id || profile.role === 'doc',
  }))
}

export async function createBlankDrill(teamId: string | null): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, role, club_id')
    .eq('user_id', user.id)
    .single()
  if (!profile?.club_id) throw new Error('No club')
  if (profile.role !== 'doc' && profile.role !== 'coach') throw new Error('Forbidden')

  const { data, error } = await supabase.from('drills').insert({
    club_id: profile.club_id,
    team_id: teamId,
    created_by: profile.id,
    title: 'Untitled drill',
  }).select('id').single()

  if (error || !data) throw new Error(error?.message ?? 'Insert failed')
  revalidatePath('/dashboard/tactics')
  return data.id
}

export async function deleteDrill(drillId: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('drills').delete().eq('id', drillId)
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/tactics')
}

export async function duplicateDrill(drillId: string): Promise<string> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await supabase
    .from('profiles').select('id, club_id').eq('user_id', user.id).single()
  if (!profile?.club_id) throw new Error('No club')

  const { data: src } = await supabase.from('drills').select('*').eq('id', drillId).single()
  if (!src) throw new Error('Not found')

  const { data, error } = await supabase.from('drills').insert({
    club_id: profile.club_id,
    team_id: src.team_id,
    created_by: profile.id,
    title: `${src.title} (copy)`,
    description: src.description,
    category: src.category,
    visibility: 'private', // copies start private
    field: src.field,
    objects: src.objects,
  }).select('id').single()
  if (error || !data) throw new Error(error?.message ?? 'Duplicate failed')
  revalidatePath('/dashboard/tactics')
  return data.id
}

export async function updateVisibility(drillId: string, visibility: Visibility) {
  const supabase = await createClient()
  const { error } = await supabase.from('drills').update({ visibility }).eq('id', drillId)
  if (error) throw new Error(error.message)
  revalidatePath('/dashboard/tactics')
}
```

- [ ] **Step 2: Write `new/page.tsx` — creates blank drill + redirects**

```tsx
import { redirect } from 'next/navigation'
import { createBlankDrill } from '../actions'

export default async function NewDrillPage({ searchParams }: { searchParams: Promise<{ teamId?: string }> }) {
  const { teamId } = await searchParams
  const id = await createBlankDrill(teamId ?? null)
  redirect(`/dashboard/tactics/${id}`)
}
```

- [ ] **Step 3: Write `loading.tsx`**

```tsx
export default function Loading() {
  return (
    <div className="p-6 animate-pulse space-y-4">
      <div className="h-8 w-48 bg-white/10 rounded" />
      <div className="h-10 w-full bg-white/5 rounded" />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="aspect-[16/10] bg-white/5 rounded-lg" />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Write `page.tsx` — server component, loads drills + passes to client**

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { listDrills } from './actions'
import LibraryClient from './library-client'

export default async function TacticsLibraryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/access')
  const { data: profile } = await supabase
    .from('profiles').select('id, role, club_id').eq('user_id', user.id).single()
  if (!profile?.club_id) redirect('/onboarding')
  if (profile.role !== 'doc' && profile.role !== 'coach') redirect('/dashboard')

  const drills = await listDrills()
  const { data: teams } = await supabase
    .from('teams').select('id, name').eq('club_id', profile.club_id).order('name')

  return <LibraryClient drills={drills} teams={teams ?? []} role={profile.role} currentProfileId={profile.id} />
}
```

- [ ] **Step 5: Run dev + QA**

Navigate to `/dashboard/tactics` as DOC — empty state visible; as parent — redirected to `/dashboard`. Leave the client component empty shell for now; Task 6 fills it in.

- [ ] **Step 6: Commit**

```bash
cd /Users/canci27/Desktop/offpitchos && git add app-next/app/dashboard/tactics
git commit -m "feat(tactics): library route + server actions"
```

---

### Task 6: Library client — filters + card grid

**Files:**
- Create: `app-next/app/dashboard/tactics/library-client.tsx`

- [ ] **Step 1: Write `library-client.tsx`**

```tsx
'use client'
import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DRILL_CATEGORIES, DRILL_CATEGORY_LABELS, VISIBILITIES } from '@/lib/tactics/drill-categories'
import { deleteDrill, duplicateDrill, updateVisibility } from './actions'
import type { DrillSummary } from './actions'

interface Props {
  drills: DrillSummary[]
  teams: { id: string; name: string }[]
  role: string
}

// page.tsx must pass `currentProfileId` so the "My drills" filter works client-side
export default function LibraryClient({ drills, teams, role, currentProfileId }: Props & { currentProfileId: string }) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [teamId, setTeamId] = useState<string>('all')
  const [category, setCategory] = useState<string>('all')
  const [visibility, setVisibility] = useState<string>('all')
  const [search, setSearch] = useState('')

  const filtered = useMemo(() => drills.filter(d => {
    if (teamId !== 'all' && (teamId === 'none' ? d.teamId !== null : d.teamId !== teamId)) return false
    if (category !== 'all' && d.category !== category) return false
    if (visibility === 'mine') { if (d.createdById !== currentProfileId) return false }
    else if (visibility !== 'all' && d.visibility !== visibility) return false
    if (search && !d.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }), [drills, teamId, category, visibility, search])

  async function handleDelete(id: string) {
    if (!confirm('Delete this drill? This cannot be undone.')) return
    startTransition(async () => { await deleteDrill(id); router.refresh() })
  }

  async function handleDuplicate(id: string) {
    startTransition(async () => {
      const newId = await duplicateDrill(id)
      router.push(`/dashboard/tactics/${newId}`)
    })
  }

  async function handleVisibilityChange(id: string, v: 'private'|'team'|'club') {
    startTransition(async () => { await updateVisibility(id, v); router.refresh() })
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Tactics Board</h1>
        <Link
          href={`/dashboard/tactics/new${teamId !== 'all' && teamId !== 'none' ? `?teamId=${teamId}` : ''}`}
          className="bg-green text-dark px-4 py-2 rounded-lg font-medium hover:brightness-110"
        >+ New drill</Link>
      </header>

      <div className="flex flex-wrap gap-2">
        <select value={teamId} onChange={e => setTeamId(e.target.value)} className="bg-dark-secondary border border-white/10 rounded px-3 py-2 text-sm">
          <option value="all">All teams</option>
          <option value="none">Club-wide</option>
          {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={category} onChange={e => setCategory(e.target.value)} className="bg-dark-secondary border border-white/10 rounded px-3 py-2 text-sm">
          <option value="all">All categories</option>
          {DRILL_CATEGORIES.map(c => <option key={c} value={c}>{DRILL_CATEGORY_LABELS[c]}</option>)}
        </select>
        <select value={visibility} onChange={e => setVisibility(e.target.value)} className="bg-dark-secondary border border-white/10 rounded px-3 py-2 text-sm">
          <option value="all">All visibility</option>
          <option value="mine">My drills</option>
          {VISIBILITIES.map(v => <option key={v} value={v}>{v[0].toUpperCase() + v.slice(1)}</option>)}
        </select>
        <input
          value={search} onChange={e => setSearch(e.target.value)} placeholder="Search drills…"
          className="bg-dark-secondary border border-white/10 rounded px-3 py-2 text-sm flex-1 min-w-[160px]"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="border border-dashed border-white/10 rounded-lg p-12 text-center text-gray">
          <p className="mb-2">No drills yet.</p>
          <p className="text-sm">Create your first drill to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(d => <DrillCard key={d.id} drill={d} onDelete={handleDelete} onDuplicate={handleDuplicate} onVisibilityChange={handleVisibilityChange} />)}
        </div>
      )}
    </div>
  )
}

function DrillCard({ drill, onDelete, onDuplicate, onVisibilityChange }: {
  drill: DrillSummary
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
  onVisibilityChange: (id: string, v: 'private'|'team'|'club') => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const vIcon = drill.visibility === 'private' ? '🔒' : drill.visibility === 'team' ? '👥' : '🌍'
  return (
    <div className="bg-dark-secondary rounded-lg overflow-hidden border border-white/5 hover:border-white/20 transition">
      <Link href={`/dashboard/tactics/${drill.id}`} className="block">
        <div className="aspect-[16/10] bg-dark flex items-center justify-center text-gray text-xs">
          {drill.thumbnailUrl
            ? <img src={drill.thumbnailUrl} alt="" className="w-full h-full object-cover" />
            : <span>No preview yet</span>}
        </div>
      </Link>
      <div className="p-3 space-y-2">
        <Link href={`/dashboard/tactics/${drill.id}`} className="block font-medium truncate hover:text-green">{drill.title}</Link>
        <div className="flex items-center gap-2 text-xs text-gray">
          <span>{vIcon} {drill.visibility}</span>
          {drill.teamName && <span>· {drill.teamName}</span>}
          <span>· {drill.category}</span>
        </div>
        <div className="flex items-center justify-between text-xs text-gray">
          <span>{drill.createdByName ?? 'Unknown'}</span>
          <div className="relative">
            <button onClick={() => setMenuOpen(o => !o)} className="px-2 py-1 hover:bg-white/5 rounded">⋯</button>
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1 bg-dark border border-white/10 rounded-lg shadow-lg z-10 min-w-[160px]">
                <button onClick={() => { setMenuOpen(false); onDuplicate(drill.id) }} className="block w-full text-left px-3 py-2 text-sm hover:bg-white/5">Duplicate</button>
                {drill.canEdit && <>
                  <button onClick={() => { setMenuOpen(false); onVisibilityChange(drill.id, 'private') }} className="block w-full text-left px-3 py-2 text-sm hover:bg-white/5">Make Private</button>
                  <button onClick={() => { setMenuOpen(false); onVisibilityChange(drill.id, 'team') }} className="block w-full text-left px-3 py-2 text-sm hover:bg-white/5">Make Team</button>
                  <button onClick={() => { setMenuOpen(false); onVisibilityChange(drill.id, 'club') }} className="block w-full text-left px-3 py-2 text-sm hover:bg-white/5">Make Club-wide</button>
                </>}
                {drill.canDelete && <button onClick={() => { setMenuOpen(false); onDelete(drill.id) }} className="block w-full text-left px-3 py-2 text-sm hover:bg-white/5 text-red">Delete</button>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: QA**

- `/dashboard/tactics` as DOC shows empty state ✅
- `+ New drill` creates drill, routes to `/dashboard/tactics/<uuid>` (404s until Task 7) ✅
- Filters (team, category, visibility, search) narrow the list ✅
- Card `⋯` menu: duplicate, visibility change, delete all work ✅
- As parent: `/dashboard/tactics` redirects to `/dashboard` ✅

- [ ] **Step 3: Commit**

```bash
git add app-next/app/dashboard/tactics/library-client.tsx
git commit -m "feat(tactics): library UI with filters + cards"
```

---

### Task 7: Field renderer (shared Konva component)

**Files:**
- Create: `app-next/lib/tactics/field-renderer.tsx`

This component renders a field + all `BoardObject`s, scaled to a given pixel width/height. It is shared by the editor, the readonly view, and the server-side thumbnail generator. It accepts callbacks for selection + drag + transform so the editor can layer in interactivity without the read-only view inheriting it.

- [ ] **Step 1: Write the component**

(~300 lines — core logic only, pseudo-outlined here for planning; the full file is included in appendix A at the end of this plan)

The component must:
1. Render a `<Stage>` with `<Layer>` for field markings, and one `<Layer>` for objects.
2. Compute a `pixelsPerMeter` from field dimensions + stage size; use for scaling all coordinates.
3. Draw field: rectangle, center line, center circle, penalty boxes (scaled to FIFA standards relative to field dims), goals at each end.
4. Render each object per its `type`:
   - `player` → `<Circle>` with color map (red/blue/neutral/outside/gk/coach → palette), optional `<Text>` for number/position
   - `cone` → small `<RegularPolygon>` (triangle) in cone color
   - `ball` → `<Circle>` with white + black hex pattern (SVG path as `<Image>`, or simplified `<Circle>` white)
   - `goal` → `<Rect>` for posts + crossbar proportional to variant
   - `arrow` → `<Arrow>` with dashArray for `run`, solid for `pass`/`free`; color per style
   - `zone` → `<Rect>` with fill + opacity + optional `<Text>` label
   - `zone-line` → `<Line>` with dashes
5. Props: `{ field, objects, width, height, interactive?, onSelect?, onDragEnd?, selectedIds? }`.
6. Export a `renderDrillToCanvas(field, objects, width, height)` helper for server-side PNG rendering (used in thumbnail generator).

- [ ] **Step 2: Build + type-check**

```bash
cd /Users/canci27/Desktop/offpitchos/app-next && npx tsc --noEmit && npm run build
```

Expected: clean build. `react-konva` requires `'use client'` directive at the top of the file.

- [ ] **Step 3: Commit**

```bash
git add app-next/lib/tactics/field-renderer.tsx
git commit -m "feat(tactics): shared Konva field renderer"
```

---

### Task 8: Editor route shell

**Files:**
- Create: `app-next/app/dashboard/tactics/[drillId]/page.tsx`
- Create: `app-next/app/dashboard/tactics/[drillId]/readonly-view.tsx`

- [ ] **Step 1: Write `page.tsx`**

```tsx
import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DrillRowSchema } from '@/lib/tactics/object-schema'
import EditorClient from './editor-client'
import ReadonlyView from './readonly-view'

export default async function DrillPage({
  params, searchParams,
}: {
  params: Promise<{ drillId: string }>
  searchParams: Promise<{ readonly?: string }>
}) {
  const { drillId } = await params
  const { readonly } = await searchParams
  const isReadonly = readonly === '1'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/access')
  const { data: profile } = await supabase
    .from('profiles').select('id, role, club_id').eq('user_id', user.id).single()
  if (!profile?.club_id) redirect('/onboarding')
  if (profile.role !== 'doc' && profile.role !== 'coach') redirect('/dashboard')

  const { data: row, error } = await supabase.from('drills').select('*').eq('id', drillId).single()
  if (error || !row) notFound()
  const parsed = DrillRowSchema.safeParse(row)
  if (!parsed.success) throw new Error('Corrupt drill doc: ' + parsed.error.message)

  const { data: teams } = await supabase
    .from('teams').select('id, name').eq('club_id', profile.club_id).order('name')

  if (isReadonly) return <ReadonlyView drill={parsed.data} />
  return <EditorClient drill={parsed.data} teams={teams ?? []} role={profile.role} />
}
```

- [ ] **Step 2: Write `readonly-view.tsx`**

```tsx
'use client'
import { FieldRenderer } from '@/lib/tactics/field-renderer'
import type { DrillRow } from '@/lib/tactics/object-schema'
import { useEffect, useRef, useState } from 'react'

export default function ReadonlyView({ drill }: { drill: DrillRow }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ w: 800, h: 500 })
  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setSize({ w: entry.contentRect.width, h: Math.round(entry.contentRect.width * 0.625) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      <h1 className="text-xl md:text-2xl font-bold">{drill.title}</h1>
      {drill.description && <p className="text-sm text-gray whitespace-pre-line">{drill.description}</p>}
      <div ref={wrapRef} className="bg-dark-secondary rounded-lg overflow-hidden">
        <FieldRenderer field={drill.field} objects={drill.objects} width={size.w} height={size.h} />
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Stub `editor-client.tsx`** so the build doesn't break — Task 9 fills in the real editor.

```tsx
'use client'
import type { DrillRow } from '@/lib/tactics/object-schema'
export default function EditorClient({ drill }: { drill: DrillRow, teams: { id:string, name:string }[], role: string }) {
  return <div className="p-6">Editor stub for {drill.title}</div>
}
```

- [ ] **Step 4: QA**

- `/dashboard/tactics/<newDrillId>` shows "Editor stub for Untitled drill" ✅
- `/dashboard/tactics/<newDrillId>?readonly=1` shows the field (empty drill) + title ✅
- Parent visit redirects to `/dashboard` ✅

- [ ] **Step 5: Commit**

```bash
git add app-next/app/dashboard/tactics/[drillId]
git commit -m "feat(tactics): editor shell + readonly view"
```

---

### Task 9: Editor client — tool palette + object placement

**Files:**
- Rewrite: `app-next/app/dashboard/tactics/[drillId]/editor-client.tsx`

This is the largest task in the plan. It implements: tool palette (left 64px rail), tool state machine (click tool → click field places object), selection, drag-to-move, delete, undo/redo stack, and auto-save via a new server action.

Because of size, the task splits into sub-steps. The full file contents are in appendix B of this plan.

- [ ] **Step 1: Write the `saveDrill` server action**

`app-next/app/dashboard/tactics/[drillId]/actions.ts`:

```ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { DrillDocSchema } from '@/lib/tactics/object-schema'
import { revalidatePath } from 'next/cache'

export async function saveDrill(drillId: string, patch: {
  title?: string
  description?: string
  category?: string
  visibility?: 'private'|'team'|'club'
  doc?: unknown
}) {
  const supabase = await createClient()
  const update: Record<string, unknown> = {}
  if (typeof patch.title === 'string') update.title = patch.title
  if (typeof patch.description === 'string') update.description = patch.description
  if (patch.category) update.category = patch.category
  if (patch.visibility) update.visibility = patch.visibility
  if (patch.doc !== undefined) {
    const parsed = DrillDocSchema.safeParse(patch.doc)
    if (!parsed.success) throw new Error('Invalid drill doc: ' + parsed.error.message)
    update.field = parsed.data.field
    update.objects = parsed.data.objects
  }
  if (Object.keys(update).length === 0) return
  const { error } = await supabase.from('drills').update(update).eq('id', drillId)
  if (error) throw new Error(error.message)
  revalidatePath(`/dashboard/tactics/${drillId}`)
}
```

- [ ] **Step 2: Write `editor-client.tsx`**

See appendix B. Key pieces:
- Reducer for editor state: `{ field, objects, selectedIds, tool, toolOption, history: { past, future } }`
- Every mutation pushes to `past`; undo pops, redo re-applies.
- Auto-save: `useEffect` with a 2000ms debounce on `{ field, objects }` calls `saveDrill(drillId, { doc: { field, objects } })`.
- Title + description editable inline in the header; they auto-save too (debounced 2s).
- Clicking a tool sets `tool`; clicking the canvas in tool mode inserts an object at the transformed coordinates (mouse px → field meters).
- Selection via click on object (Konva `onClick`); delete via `Delete` key.
- Keyboard shortcuts: V (select), P (player), C (cone), B (ball), G (goal), A (arrow), Z (zone), Esc (deselect), Del (delete), ⌘Z/⌘⇧Z (undo/redo).

- [ ] **Step 3: Build + QA**

`npm run dev` → open editor on a blank drill.
- Place a player by clicking P then clicking the field ✅
- Drag the player ✅
- Delete selected player ✅
- Undo restores it; redo removes again ✅
- Change title in header → reload → new title persists ✅
- Place cone, ball, goal, arrow (two clicks — tail then head), zone (two clicks — corner then opposite corner) ✅

- [ ] **Step 4: Commit**

```bash
git add app-next/app/dashboard/tactics/[drillId]
git commit -m "feat(tactics): editor with palette + placement + auto-save + undo"
```

---

### Task 10: Editor — properties panel

**Files:**
- Modify: `app-next/app/dashboard/tactics/[drillId]/editor-client.tsx`

Adds the right-side 280px collapsible `PropertiesPanel` context-sensitive to selection.

- [ ] **Step 1: Implement panel states**

- Nothing selected → Field settings (width, length, units, orientation, half/full, style schematic/realistic)
- Single player → number input (0–99), position text (max 8 chars), role override swatches
- Single cone → color swatch (orange/yellow/red/blue/white)
- Single arrow → style (pass/run/free), thickness slider
- Single zone → color picker (8 preset swatches), opacity slider, label text
- Single goal → variant dropdown (mini-h/mini-v/full), rotation slider
- Multi-select → Delete, Duplicate, Align (left/center/right/top/middle/bottom)

Each change dispatches a reducer action that also records undo state.

- [ ] **Step 2: QA**

Place one of each object type, select it, change each prop, verify the canvas updates and the save persists.

- [ ] **Step 3: Commit**

```bash
git commit -am "feat(tactics): properties panel"
```

---

### Task 11: Editor — multi-select, copy/paste, duplicate, snap

**Files:**
- Modify: `app-next/app/dashboard/tactics/[drillId]/editor-client.tsx`

- [ ] **Step 1: Marquee selection** — pointer-down on empty field + drag creates a selection rectangle; objects inside are added to selection. Shift-click toggles.
- [ ] **Step 2: `⌘A` select all** — selects every object on the canvas.
- [ ] **Step 3: Copy/paste/duplicate** — `⌘C` serializes selection to in-memory clipboard; `⌘V` clones with new ids, offset (+2m, +2m) from originals; `⌘D` = copy + paste in one.
- [ ] **Step 4: Lock / hide** — right-click on a selected object opens a context menu with `Lock` (reject drag, still rendered) / `Hide` (invisible but present in data) / `Unlock` / `Unhide`. Store `locked: boolean` and `hidden: boolean` as optional fields on the object (extend the Zod schema in Task 3 to accept these as optional — edit `BoardObject` base to include `locked: z.boolean().optional(), hidden: z.boolean().optional()` on each variant).
- [ ] **Step 5: Snap** — while dragging, snap to: field center line, penalty-area edges, other object centers (within 0.5m), 5m grid (if enabled). Render purple dashed alignment guide overlay during drag.
- [ ] **Step 6: Snap toggle** button in bottom-right of canvas (`⊞ Snap on` / `⊟ Snap off`).
- [ ] **Step 7: QA** — test all shortcuts with multiple objects; verify locked objects reject drag and hidden objects disappear.
- [ ] **Step 8: Commit**

```bash
git commit -am "feat(tactics): multi-select, copy/paste, duplicate, snap"
```

---

### Task 12: Formation templates + field-templates.ts

**Files:**
- Create: `app-next/lib/tactics/field-templates.ts`
- Modify: `app-next/app/dashboard/tactics/[drillId]/editor-client.tsx`

- [ ] **Step 1: Implement `field-templates.ts`**

```ts
import type { BoardObject, Field } from './object-schema'

export type FormationName = '4-4-2' | '4-3-3' | '4-2-3-1' | '3-5-2' | '3-4-3' | '5-3-2' | '4-1-4-1' | 'diamond'

export function generateFormation(name: FormationName, field: Field): BoardObject[] {
  // Returns 11 player objects positioned on the attacking half, relative to field.length_m × field.width_m
  // Starts with a GK on the goal line, then defenders, midfielders, forwards per shape.
  // Uses symmetric placement along the length axis.
  // (Full coordinate table in appendix C)
}
```

- [ ] **Step 2: Add Formation menu in palette**

A button `F` opens a popover listing all 8 formations. Clicking one replaces the current `objects` array with the generated formation (undoable).

- [ ] **Step 3: QA**

Open new blank drill, click each formation, verify correct player count + rough positions.

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(tactics): formation templates"
```

---

### Task 13: PNG export (client-side)

**Files:**
- Modify: `app-next/app/dashboard/tactics/[drillId]/editor-client.tsx`

- [ ] **Step 1: Implement `Export PNG`** button in top bar — calls `stageRef.current.toDataURL({ pixelRatio: 2, mimeType: 'image/png' })`, creates an `<a download>` link, clicks it. Filename: `${slugify(drill.title)}.png`.
- [ ] **Step 2: QA** — export a drill, open PNG in Preview, verify all objects render cleanly at 2x.
- [ ] **Step 3: Commit**

```bash
git commit -am "feat(tactics): client-side PNG export"
```

---

### Task 14: Server-side thumbnail generation

**Files:**
- Create: `app-next/lib/tactics/thumbnail.ts`
- Modify: `app-next/app/dashboard/tactics/[drillId]/actions.ts`

- [ ] **Step 1: Write `thumbnail.ts`**

Uses `@napi-rs/canvas` directly (not Konva) to render the field and objects — Konva requires a DOM. We re-implement the same rendering logic as `field-renderer.tsx` but using `CanvasRenderingContext2D`. Same coordinate system.

```ts
import { createCanvas } from '@napi-rs/canvas'
import type { BoardObject, Field } from './object-schema'

export async function renderThumbnailPng(field: Field, objects: BoardObject[]): Promise<Buffer> {
  const W = 640, H = 400
  const canvas = createCanvas(W, H)
  const ctx = canvas.getContext('2d')
  drawField(ctx, field, W, H)
  drawObjects(ctx, field, objects, W, H)
  return canvas.toBuffer('image/png')
}

// drawField and drawObjects implement the same visual spec as field-renderer.tsx
// (implementation details in appendix D)
```

- [ ] **Step 2: Add `regenerateThumbnail` server action**

In `[drillId]/actions.ts`:

```ts
'use server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { renderThumbnailPng } from '@/lib/tactics/thumbnail'
import { DrillDocSchema } from '@/lib/tactics/object-schema'

export async function regenerateThumbnail(drillId: string) {
  const supabase = await createClient()
  // Read with the caller's client — RLS enforces that the caller can see the drill.
  // We then do a second permission check: the caller must have edit rights (creator,
  // doc in same club, or rostered coach on non-private drill). Only then do we use
  // the service client to upload. Defense-in-depth against an authenticated user
  // triggering thumbnail regen on a drill they can read but not edit.
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')
  const { data: profile } = await supabase
    .from('profiles').select('id, role, club_id').eq('user_id', user.id).single()
  if (!profile) throw new Error('No profile')
  const { data: drill } = await supabase
    .from('drills').select('id, club_id, team_id, created_by, visibility, field, objects').eq('id', drillId).single()
  if (!drill) return
  const canEdit =
    drill.created_by === profile.id ||
    (profile.role === 'doc' && profile.club_id === drill.club_id) ||
    (profile.role === 'coach' && drill.visibility !== 'private' && drill.team_id &&
      await isRosteredOnTeam(supabase, profile.id, drill.team_id))
  if (!canEdit) throw new Error('Forbidden')

  const parsed = DrillDocSchema.safeParse({ field: drill.field, objects: drill.objects })
  if (!parsed.success) return
  const png = await renderThumbnailPng(parsed.data.field, parsed.data.objects)
  const path = `${drill.club_id}/${drill.id}.png`
  const svc = createServiceClient()
  await svc.storage.from('drill-thumbnails').upload(path, png, { contentType: 'image/png', upsert: true })
  await supabase.from('drills').update({ thumbnail_path: path }).eq('id', drillId)
}

// Helper — reads team_members to confirm roster. Callers: thumbnail regen.
async function isRosteredOnTeam(supabase: Awaited<ReturnType<typeof createClient>>, profileId: string, teamId: string) {
  const { data } = await supabase
    .from('team_members').select('id').eq('profile_id', profileId).eq('team_id', teamId).maybeSingle()
  return !!data
}
```

- [ ] **Step 3: Fire on save**

In `editor-client.tsx`, after every debounced auto-save (debounce the thumbnail call to 10s to avoid thrashing), call `regenerateThumbnail(drillId)`.

- [ ] **Step 4: QA**

Edit a drill, wait 10s, reload the library page — the card thumbnail reflects the drill. Open in another browser tab.

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(tactics): server-side thumbnail generation"
```

---

### Task 15: Session plan in event modal

**Files:**
- Create: `app-next/app/dashboard/schedule/session-plan.tsx`
- Modify: `app-next/app/dashboard/schedule/actions.ts` (add 4 new server actions)
- Modify: `app-next/app/dashboard/schedule/event-modal.tsx` (mount SessionPlan)

- [ ] **Step 1: Server actions (`attachDrill`, `detachDrill`, `reorderDrills`, `updateAttachment`)**

Append to `app/dashboard/schedule/actions.ts`:

```ts
export async function attachDrill(eventId: string, drillId: string) {
  const supabase = await createClient()
  const { data: maxRow } = await supabase
    .from('event_drills').select('order_index').eq('event_id', eventId).order('order_index', { ascending: false }).limit(1).maybeSingle()
  const nextIndex = (maxRow?.order_index ?? -1) + 1
  const { error } = await supabase.from('event_drills').insert({ event_id: eventId, drill_id: drillId, order_index: nextIndex })
  if (error) throw new Error(error.message)
  revalidatePath(`/dashboard/schedule`)
}

export async function detachDrill(id: string) {
  const supabase = await createClient()
  const { error } = await supabase.from('event_drills').delete().eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/dashboard/schedule`)
}

export async function reorderDrills(eventId: string, ids: string[]) {
  const supabase = await createClient()
  await Promise.all(ids.map((id, i) =>
    supabase.from('event_drills').update({ order_index: i }).eq('id', id).eq('event_id', eventId)
  ))
  revalidatePath(`/dashboard/schedule`)
}

export async function updateAttachment(id: string, patch: { duration_minutes?: number, coach_notes?: string }) {
  const supabase = await createClient()
  const { error } = await supabase.from('event_drills').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
  revalidatePath(`/dashboard/schedule`)
}

export async function listAttachedDrills(eventId: string) {
  const supabase = await createClient()
  const { data } = await supabase
    .from('event_drills')
    .select('id, drill_id, order_index, duration_minutes, coach_notes, drills(title, category, thumbnail_path, team_id)')
    .eq('event_id', eventId)
    .order('order_index')
  return data ?? []
}
```

- [ ] **Step 2: `session-plan.tsx`** — client component rendering the list + picker + reorder UI.

- [ ] **Step 3: Mount inside `event-modal.tsx`** for `doc` + `coach` roles only, below the attendance/coverage area.

- [ ] **Step 4: QA**

- Open an event as DOC → Session plan section visible
- Click + Add drill → picker shows team drills + club-wide drills
- Attach 2 drills → they appear in order with duration inputs
- Change duration, add notes → persists on blur
- Drag to reorder → order_index persists
- Total duration at top; exceeds event length → red warning
- Tap a drill card → opens `/dashboard/tactics/<id>?readonly=1` in a new tab
- As parent, Session plan section does not render

- [ ] **Step 5: Commit**

```bash
git commit -am "feat(tactics): session plan attachment in event modal"
```

---

### Task 16: End-to-end QA + deploy

- [ ] **Step 1: Full build + lint**

```bash
cd /Users/canci27/Desktop/offpitchos/app-next && npm run build && npm run lint
```

Expected: clean.

- [ ] **Step 2: Multi-role manual QA checklist**

Use the three test accounts + admin role-switcher:

**As DOC:**
- [ ] Create drill, edit, save, PNG export works
- [ ] Library filters (team, category, visibility, search) work
- [ ] Attach 2 drills to Tuesday's U14 practice
- [ ] Open attached drill from event → readonly view renders on phone width
- [ ] Delete a drill → gone from library and from event

**As coach (rostered to U14):**
- [ ] See U14 drills + club-wide
- [ ] Do NOT see U10 drills
- [ ] Edit a Team-visibility drill on U14
- [ ] Can NOT delete drill created by DOC (unless it's mine)

**As parent:**
- [ ] `/dashboard/tactics` → redirected to `/dashboard`
- [ ] `/dashboard/tactics/<anyId>` → redirected
- [ ] Schedule event page shows no Session plan section
- [ ] Direct link to `?readonly=1` also redirects (parents never see drills)

- [ ] **Step 3: Deploy to production**

```bash
cd /Users/canci27/Desktop/offpitchos && vercel --prod --yes
```

Watch the deploy, then smoke-test on offpitchos.com with the real DOC account.

- [ ] **Step 4: Mark Phase A complete**

Update task #5 in the tracker as completed. Phase B (AI auto-layout) is the next feature arc — covered by a separate plan.

---

## Appendices

Appendices A, B, C, D contain full file contents referenced above. During execution, the agent should fill these in from the schema and UI specs in sections 2–3 of the plan, referring back to the spec doc (`docs/superpowers/specs/2026-04-20-tactics-board-design.md`) for visual conventions, coordinates, and color values. These appendices are intentionally terse because the agent will expand them using the schema + spec as source of truth rather than re-copying a large file contents block here.

### Appendix A — `field-renderer.tsx`
Konva stage + field markings + object rendering. Props `{ field, objects, width, height, interactive?, onSelect?, onTransform?, selectedIds? }`. Must be `'use client'`. Use `Stage > Layer(field markings)` + `Layer(objects)`.

### Appendix B — `editor-client.tsx`
- Reducer (`editorReducer`) with actions: `SET_TOOL`, `PLACE_OBJECT`, `MOVE_OBJECT`, `DELETE_SELECTED`, `UNDO`, `REDO`, `UPDATE_OBJECT`, `SELECT`, `DESELECT_ALL`, `SET_FIELD`, `SET_TITLE`, `SET_DESCRIPTION`, `LOAD_FORMATION`, `PASTE`.
- Three zones in layout: top bar, left palette (w-16), center canvas (flex-1), right props panel (w-72 collapsible).
- Debounce auto-save (2s) and thumbnail regen (10s) using shared debounced setter.
- Keyboard handler in `useEffect` — registered on `window`, cleaned on unmount.

### Appendix C — Formation coordinate tables
For each formation: array of 11 `{ role: 'red', x_frac, y_frac, position }` where `x_frac` and `y_frac` are 0–1 of field dimensions (x is along the length axis from own goal to opponent goal; y is the width axis). GK at (0.05, 0.5); back line around y-fractions appropriate to formation (4-back: y = 0.15/0.35/0.55/0.75/0.85 spread evenly; 3-back: y = 0.2/0.5/0.8; etc.). Midfielders + forwards follow similar conventions. The generator function maps fractions × field_size → meter coordinates.

**`diamond`** refers specifically to the **4-4-2 diamond midfield** (flat back four + CDM + two CMs wide + CAM + two strikers). Not the "midfield diamond in a 4-4-2" variant vs. the rare "diamond 4-1-2-1-2" spelled differently — here it is fully equivalent to 4-1-2-1-2 with a flat back four.

### Appendix D — `thumbnail.ts` drawing code
Mirrors `field-renderer.tsx` using raw Canvas 2D API: `ctx.fillRect`, `ctx.arc`, `ctx.stroke`, `ctx.setLineDash`. Same object → drawing mapping.

---

## Execution notes

- **Frequent commits.** Each task ends in a commit. If a task is big (Task 9), commit sub-steps as "wip(tactics): ..." internally and squash at the end if wanted.
- **Auto-deploy.** Per user preference (saved feedback memory), after each major task push to main so Vercel deploys. This surfaces regressions early.
- **Prompt caching.** Not used in Phase A (no AI). Carry over to Phase B.
- **RLS is load-bearing.** Any RLS change must be re-verified by running the multi-role manual QA checklist from Task 16.
