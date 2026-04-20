# Tactics Board — Design

**Date:** 2026-04-20
**Status:** Approved (awaiting spec review)
**Scope:** Interactive soccer tactics board for DOCs and coaches, shipped in four phases (A → B → C → D). Each phase is independently shippable and testable.

## Goal

Give DOCs and coaches a professional, in-app tactics board to design drills, build session plans, and pull them up on the field — replacing the need for external tools like Movesboard, TacticalPad, or paper. Make it sticky by attaching drills to schedule events so the session plan lives where the practice lives.

Competitive reference: https://www.movesboard.com/ (editor + AI auto-layout). Our differentiation: drills are team-scoped, attachable to schedule events, and viewable on any device (phones included for read-only).

## Non-Goals

- Parents or players accessing the tactics board (role-gated to `doc` + `coach`)
- Real-time multiplayer editing (single-user edit, auto-save to server; Phase D optionally adds versioning)
- Video/GIF export (Phase D animation is on-screen only in v1)
- Native mobile editing — editor requires screen ≥ 768px. Read-only view works everywhere.
- Drill library search across other clubs (per-club only)

## Architecture

### Storage

- Supabase Storage bucket: `drill-thumbnails` (public read, RLS-protected write) — PNG previews used on library cards
- Path convention: `drill-thumbnails/{club_id}/{drill_id}.png`
- Drill objects themselves are **not** stored as files — the full drill document (field + objects) lives in the `drills` table as JSONB

### Database

New table `drills`:

| Column            | Type        | Notes |
|-------------------|-------------|-------|
| id                | uuid PK     | `default gen_random_uuid()` |
| club_id           | uuid FK     | → `clubs(id) on delete cascade` |
| team_id           | uuid FK     | → `teams(id) on delete cascade`, nullable (null = club-wide) |
| created_by        | uuid FK     | → `profiles(id)` |
| title             | text        | |
| description       | text        | used for AI input + PDF output |
| category          | text        | `rondo | build-up | pressing | finishing | warm-up | ssg | transition | other` |
| visibility        | text        | `private | team | club` |
| field             | jsonb       | `{ width_m, length_m, units: 'm'|'yd', orientation: 'horizontal'|'vertical', half_field: bool, style: 'schematic'|'realistic' }` |
| objects           | jsonb       | array of board objects (see Object Schema) |
| thumbnail_path    | text        | storage path of preview PNG, nullable |
| created_at        | timestamptz | `default now()` |
| updated_at        | timestamptz | `default now()`, auto-updated trigger |

Indexes:
- `(club_id, team_id, updated_at DESC)` — library list queries
- `(created_by, updated_at DESC)` — "my drills" filter
- `(club_id, category)` — category filter

New table `event_drills` (Phase A.5 — schedule attachment):

| Column             | Type        | Notes |
|--------------------|-------------|-------|
| id                 | uuid PK     | |
| event_id           | uuid FK     | → `events(id) on delete cascade` |
| drill_id           | uuid FK     | → `drills(id) on delete cascade` |
| order_index        | int         | for drag-reorder |
| duration_minutes   | int         | default 15 |
| coach_notes        | text        | nullable |
| created_at         | timestamptz | |

Index: `(event_id, order_index)`.

### Row Level Security

`drills` policies:

- **SELECT:**
  - creator can always read
  - if `visibility = 'club'` → any user in same `club_id` with role `doc` or `coach`
  - if `visibility = 'team'` → any user in same `club_id` rostered to `team_id` with role `doc` or `coach`
  - if `visibility = 'private'` → creator only
- **INSERT:** role must be `doc` or `coach` AND `club_id` matches caller's club AND (`team_id IS NULL` requires `role = 'doc'`, otherwise `team_id` must be in user's rostered teams or user is `doc`)
- **UPDATE:** creator OR (`role = 'doc'` AND same club) OR (`role = 'coach'` AND rostered to `team_id` AND `visibility != 'private'`)
- **DELETE:** creator OR (`role = 'doc'` AND same club)

`event_drills` policies: any user who can SELECT the parent event AND has role `doc` or `coach` can read; only `doc`/`coach` rostered to the event's team can write.

Parents and players **never** see drills or event_drills (server-side filter in every endpoint, defense-in-depth on RLS).

Storage bucket `drill-thumbnails`:
- Read: public (no PII in thumbnails, simplifies library page)
- Write: authenticated, role `doc` or `coach`, path must match their `club_id`

### Routes / Files

```
app-next/app/dashboard/tactics/
  page.tsx                      # Library — server component, initial render
  library-client.tsx            # Filters, search, grid, card actions
  actions.ts                    # Server actions: createDrill, duplicateDrill, deleteDrill, updateVisibility
  loading.tsx
  [drillId]/
    page.tsx                    # Editor shell — server component, loads drill, enforces RLS
    editor-client.tsx           # Konva stage + palette + props panel
    actions.ts                  # saveDrill (auto-save), generateThumbnail, exportPng
    readonly-view.tsx           # ?readonly=1 mode for phone viewing
  new/
    page.tsx                    # Creates a blank drill, redirects to /[drillId]
  ai/
    actions.ts                  # Phase B — generateDrillFromDescription

app-next/lib/tactics/
  object-schema.ts              # Zod schemas for all board objects — shared by editor, AI, validators
  konva-renderer.tsx            # Shared canvas component used by editor + readonly + thumbnail generator
  field-templates.ts            # Formation templates (4-4-2, 4-3-3, etc.)
  drill-categories.ts           # Enum + display labels

app-next/components/
  tactics-board.tsx             # Thin wrapper around konva-renderer for embedded views
```

Schedule attachment UI lives inside the existing `app/dashboard/schedule/[eventId]` route — a new `Session plan` section, not a separate page.

### Sidebar item

Add `{ label: 'Tactics', href: '/dashboard/tactics', icon: <TacticsIcon />, roles: ['doc', 'coach'] }` to `components/sidebar.tsx`, inserted between `Coverage` and `Coaches`. New `TacticsIcon` — soccer field outline SVG.

## Object Schema

All board objects share a common shape, discriminated on `type`:

```ts
type BoardObject =
  | { id: string; type: 'player'; x: number; y: number; team: 'red' | 'blue' | 'neutral' | 'outside' | 'gk' | 'coach'; number?: number; position?: string }
  | { id: string; type: 'cone'; x: number; y: number; color: 'orange' | 'yellow' | 'red' | 'blue' | 'white' }
  | { id: string; type: 'ball'; x: number; y: number }
  | { id: string; type: 'goal'; x: number; y: number; variant: 'mini-h' | 'mini-v' | 'full'; rotation?: number }
  | { id: string; type: 'arrow'; points: number[]; style: 'pass' | 'run' | 'free'; thickness?: number }
  | { id: string; type: 'zone'; x: number; y: number; width: number; height: number; color: string; opacity: number; label?: string }
  | { id: string; type: 'zone-line'; points: [number, number, number, number]; color: string }
```

Coordinates are in field-relative units (meters, matching `field.width_m` × `field.length_m`). The Konva stage scales field-units → pixels for rendering. This keeps drills resolution-independent and makes PDF export trivial.

Zod schema lives in `lib/tactics/object-schema.ts` and is the **single source of truth** for the editor, AI auto-layout validator, and thumbnail generator.

## UI Design

### Drill library (`/dashboard/tactics`)

Top-down:
1. **Header row** — "Tactics Board" title, `+ New drill` button, `Generate with AI ✨` button (grayed pre-Phase-B)
2. **Filter bar** — team dropdown (DOCs see `All teams` + per-team; coaches see rostered teams only) · category dropdown · visibility filter (`My drills` / `Team` / `Club` / `All`) · search input (title + description substring)
3. **Card grid** (responsive, 2/3/4 cols) — each card:
   - Preview PNG thumbnail (16:10 aspect, lazy-loaded)
   - Title
   - Team badge · category tag · visibility pill (🔒 Private · 👥 Team · 🌍 Club)
   - Author avatar + name · relative timestamp
   - `⋯` menu: Duplicate · Change visibility · Delete (permission-gated)
4. **Empty state** — illustration + "No drills yet. Create one or generate with AI."

Click anywhere on card → opens editor. Action buttons don't bubble.

### Editor (`/dashboard/tactics/[drillId]`)

Three-zone layout (desktop/tablet ≥ 768px):

```
┌──────────────────────────────────────────────────────────┐
│ Top bar: title (inline edit) · team badge · visibility   │
│          toggle · Saved/Saving · Export PNG · ⋯          │
├──────┬──────────────────────────────────────────┬────────┤
│ Tool │                                          │ Props  │
│ Pal- │           KONVA STAGE (FIELD)            │ panel  │
│ ette │                                          │        │
│ 64px │                                          │ 280px  │
└──────┴──────────────────────────────────────────┴────────┘
```

**Tool palette (left, 64px)** — icon buttons, tooltips on hover, single-letter shortcuts:
- `V` Select / move
- Players: `P` (default red, long-press for color picker: red / blue / neutral / outside / GK / coach)
- `C` Cones (long-press for color: orange / yellow / red / blue / white)
- `B` Ball
- `G` Goals (long-press: mini-h / mini-v / full)
- `A` Arrows (long-press: pass / run / free)
- `Z` Zones (long-press: rectangle / split line) — opens color picker after placement
- `F` Formations (opens menu: 4-4-2 · 4-3-3 · 4-2-3-1 · 3-5-2 · 3-4-3 · 5-3-2 · 4-1-4-1 · diamond)
- Undo / Redo / Clear at bottom

**Canvas (center)** — Konva stage. Field rendered first (schematic or realistic). Objects rendered in fixed layer order (zones < cones < goals < ball < players < arrows < labels).

**Properties panel (right, 280px, collapsible)** — context-sensitive:
- Nothing selected → **Field**: width, length, units (m/yd), orientation, half-field toggle, style (schematic/realistic)
- Single object → type-specific props (number, label, color, variant, thickness, opacity)
- Multi-select → shared properties only (color, delete, duplicate, align)

**Top bar** — drill title (click to rename), team badge, visibility pill (click → dropdown: Private / Team / Club — only permitted values shown), save status indicator, `Export PNG`, `⋯` menu (Duplicate · Delete · Mirror · Flip · Rotate field).

### Editor polish features

These are non-negotiable for a pro feel:

- **Auto-save** — debounced 2s after last change. Header shows `Saved` / `Saving…` / `Offline (queued)`. Offline queue persists in localStorage until reconnected.
- **Undo/redo** — in-memory stack, capped at 100 entries, cleared on drill close. ⌘Z / ⌘⇧Z.
- **Multi-select** — click-drag marquee, Shift-click to add/remove, ⌘A select all. Delete/duplicate/align operate on the full selection.
- **Copy / paste / duplicate** — ⌘C / ⌘V / ⌘D. Paste drops at cursor. Duplicate preserves relative positions.
- **Smart snapping** — objects snap to field center line, penalty box edges, other objects' centers/edges, and 5m grid. Alignment guides as purple dashed lines while dragging. Snap toggleable via a small button in the bottom-right corner of the canvas.
- **Lock / hide** — right-click menu on an object. Locked objects reject drag; hidden objects vanish visually but stay in data.
- **Mirror / flip / rotate** — on selection or whole drill via top bar `⋯` menu.
- **Keyboard shortcuts panel** — `?` key opens a modal listing all shortcuts.
- **Thumbnail regeneration** — fires on save (debounced 10s) via server-side Konva render → PNG → Supabase Storage upload → row `thumbnail_path` updated.

### Read-only view (`/dashboard/tactics/[drillId]?readonly=1`)

Same canvas component, no palette, no props panel, no edit affordances. Works on phones (any width). Title + description shown above the field. Pinch-to-zoom enabled so coaches can look closer on small screens. This is what opens when a coach taps a drill card from an attached schedule event.

## Schedule event attachment (Phase A.5)

Inside an existing event page (`/dashboard/schedule/[eventId]`), new section **Session plan**:

- Visible only to `doc` + `coach` roles (server-filtered)
- `+ Add drill` button opens a modal: searchable drill picker scoped to event's team + club-wide drills
- Attached drills render as ordered cards: drag handle · thumbnail · title · category · duration input · notes input · remove button
- Running total duration at the top, red warning if total exceeds event scheduled length
- Tapping the card opens the drill in read-only mode (`?readonly=1`)
- DOCs and coaches rostered to the team can reorder, edit duration/notes, remove

Implementation: new component `app/dashboard/schedule/[eventId]/session-plan.tsx` + server actions in the same route folder: `attachDrill`, `detachDrill`, `reorderDrills`, `updateAttachment`.

## Phase B — AI auto-layout

### UX

`Generate with AI ✨` button in the library header and in the empty editor state. Opens modal:

- **Description** — large textarea, placeholder "Describe your drill in English or German — e.g., '6v4 rondo in the middle third with 2 neutrals, attackers can only take 2 touches'"
- **Drill type** — dropdown (auto-detect / rondo / build-up / pressing / finishing / ssg / transition / other)
- **Field size** — optional override (width × length, units)
- **Generate** button

On submit: spinner "Generating your drill…" (~3–6s), then modal closes and the editor opens with the generated drill, title and description pre-filled. Coach can tweak before it auto-saves.

### Under the hood

Server action `app/dashboard/tactics/ai/actions.ts::generateDrillFromDescription(input)`:

1. Calls Claude `claude-sonnet-4-6` via the existing `@anthropic-ai/sdk` setup (Anthropic API key already in `.env.local`).
2. Uses **structured output** with the Zod `BoardObject` schema — forces the model to emit valid objects.
3. Uses **prompt caching** on the system prompt + few-shot examples block (static across all users). Per-call cost drops from ~2¢ → ~0.3¢ after first call.
4. Validates response against Zod schema; retries once on validation failure.
5. Server-side renders a thumbnail via `konva-renderer` + `canvas` package → uploads to `drill-thumbnails` bucket.
6. Inserts new drill row, returns `drillId` → client redirects.

### System prompt contents

- Role framing: "You are a professional soccer coach designing training drills."
- Pitch geometry primer: coordinate system, standard field dimensions, where penalty areas / center circle / goals sit.
- Object schema: the TypeScript types for `BoardObject`, with notes on typical values.
- Color conventions: attackers red, defenders blue, neutrals grey, GK yellow, coach black.
- Arrow conventions: red solid = pass, blue dashed = run, yellow = generic.
- **Few-shot examples** (≥ 8, one per major drill type): rondo · rondo with outside players · switching rondo · build-up · midfield pressing · high pressing · counter-pressing · wing play · finishing · small-sided game. Each example shows input description → full `BoardObject[]` JSON.
- Format instructions: output only JSON conforming to the schema. No markdown, no commentary.

Example cost budget: ~2000 input tokens (system + examples, cached) + ~500 input tokens (user description) + ~800 output tokens ≈ **$0.003–$0.008 per generation** with caching.

### Fallback

If validation fails after retry, surface a toast "Couldn't generate from that description — try being more specific (e.g., include number of players, field size, or drill type)." No silent failures.

## Phase C — PDF + batch export

Library: **`@react-pdf/renderer`** (not Puppeteer — lighter cold start, no headless browser memory issues on Vercel Functions, deterministic layout).

### Single drill PDF

Server action `exportDrillPdf(drillId)`:

- A4 portrait
- Header: drill title · team name · category · estimated duration · coach name
- Description paragraph
- Diagram: drill thumbnail PNG, centered, ~60% of page height
- Footer: OffPitchOS wordmark · date · page `1 / 1`

Trigger: `Export PDF` in editor top bar `⋯` menu.

### Batch (session plan) PDF

Trigger: `Print session plan` button on a schedule event page.

- Cover page: team name · session date · coach name · total duration · drill count · optional session goal
- One page per attached drill in `order_index` order:
  - Drill title + duration
  - Description + coach notes
  - Thumbnail diagram
- Footer: OffPitchOS wordmark · session date · page `n / N`

Generated on-demand, streamed as a response. No persistence — regenerate fresh each time (it's cheap).

## Phase D — Animation + polish

- **Animated arrows**: each arrow gets an optional `animate_order: number` prop. Editor has a **Play** button (top bar). On play, arrows animate in ascending `animate_order`, sequentially — a colored dot travels from tail to head over 1.2s. Loops on a 2s pause. Useful for showing the flow of a drill in sequence.
- **Version history**: on every auto-save, keep a rolling window of 10 snapshots in a `drill_versions` table. Restore button in editor `⋯` menu opens a list with thumbnails + timestamps.
- **Drill comments**: coaches can leave threaded comments on a drill ("worked great with U14"). Visible under the read-only view.
- **Performance**: profile with 200+ objects; apply Konva `perfectDrawEnabled: false`, layer caching, and batch draws as needed.

## Testing Approach

Per-phase integration tests using the existing app test harness, plus Playwright for E2E on the editor.

### Phase A tests

- RLS: parent sees empty library; coach on Team A sees Team A's drills + club-wide; coach sees no other team's drills
- Auto-save persists to DB within 3s of a change
- Undo/redo restores exact object state
- Thumbnail PNG regenerates on save and renders on the library card
- Formation template inserts 11 players at expected positions for each formation
- Role gate: parent visiting `/dashboard/tactics` redirects to `/dashboard`
- Deletion of a team cascades to its drills and event_drills
- Read-only view renders correctly on a phone-width viewport

### Phase B tests

- Generating a rondo description produces a valid `BoardObject[]` that renders without errors
- Validation retry fires on malformed first response
- Cost instrumentation: log token counts + cache hit status per call

### Phase C tests

- Single-drill PDF matches snapshot
- Batch PDF pages match `order_index`
- PDF generates even when a drill has no thumbnail (fallback: render from objects on the fly)

### Phase D tests

- Animation sequence respects `animate_order` even when arrows are added/removed
- Version history capped at 10 entries
- Restoring a version replaces the current drill atomically

## Phased rollout

Each phase ends with a deploy + user test on the live site before the next begins.

- **Phase A — Core board + schedule attachment**: target 2–3 sessions. Deliverables: library page, editor, all object types, formations, save/load, PNG export, event attachment, role gate, RLS. Ship live. Test with Jozo's test accounts (DOC / coach / parent) plus at least one live drill saved for each phase validation.
- **Phase B — AI auto-layout**: target 1–2 sessions. Deliverables: AI server action, system prompt + few-shot examples, generation modal, validation + retry. Ship live.
- **Phase C — PDF + batch export**: target 1 session. Deliverables: `@react-pdf/renderer` setup, single + batch export, event-page "Print session plan" button. Ship live.
- **Phase D — Animation + polish**: target 1 session. Deliverables: animated arrows, version history, comments, perf pass. Ship live.

Each phase is independently useful — if we stop after A, coaches have a working tactics board. If we stop after B, it's significantly better than Movesboard. After C, it replaces pen-and-paper session plans. After D, it's best-in-class.

## Open questions (non-blocking)

- Drill duplication into another club? Not in scope — each club is an island.
- Export to a coaching platform (PlayerScout, Hudl)? Not in scope; PDF covers the ask.
- OCR a whiteboard photo → drill? Interesting future feature, not in any of the four phases.
