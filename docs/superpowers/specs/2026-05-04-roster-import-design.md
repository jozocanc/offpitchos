# Roster Import (SE-import tool) — design spec

**Date:** 2026-05-04
**Author:** Jozo Cancar
**Sprint context:** Only authorized build in the 4-week sales sprint (`project_offpitchos_outreach_plan_2026_05`). Switching-cost killer for DOCs currently locked into SportsEngine / TeamSnap / GotSport. Target: a "10-min migration" promise we can put in cold-email replies and live demos.

**Build name:** `roster-import`
**Estimated effort:** 1–2 weeks (within sprint window)

---

## Scope

**In scope (v1):**
- Players + parents + teams import from a CSV file.
- One CSV row = one player, with up to 2 parents inline.
- Pre-populated column mapping for SportsEngine's known column names; editable for any other source.
- Two mount points: onboarding wizard step 3, and a `/dashboard/roster-import` page (linked from Settings + Teams page).
- Validate-then-import flow with preview screen.
- Optional bulk parent invite as a separate, deliberate click after commit.

**Explicitly out of scope (v1):**
- Coaches, schedules / events, venues, attendance.
- Undo / rollback after commit.
- CSV history or audit log.
- Real-time import progress bar.
- Mid-flow resumption after browser refresh.
- Multi-CSV / multi-file uploads.

---

## End-to-end user flow

1. **Entry**
   - Onboarding wizard step 3 ("Import your roster — optional, skip for now").
   - Dashboard: `/dashboard/roster-import` page, reachable from a button on the Teams page and a link in Settings.

2. **Upload**
   - File dropzone, CSV only, soft cap 1000 rows / ~500KB.
   - Parsed client-side via `papaparse`.
   - Auto-advance to step 2 on success.

3. **Map columns**
   - Two-column UI: their CSV headers (left) → OffPitchOS fields (right).
   - Pre-filled using the SE alias dictionary (see § Data Model).
   - Required fields show a red asterisk.
   - "Continue to preview" button calls `previewImport`.

4. **Preview + confirm**
   - Server validates + dedups + returns counts, warnings, errors.
   - DOC sees: counts of new players / parents / teams; sibling-link summary; warnings with row numbers; blocking errors (if any).
   - "Back" returns to mapping; "Confirm import" calls `commitImport`.

5. **Success**
   - Counts of created entities.
   - Single button: "Send invite emails to N parents."
   - Click triggers `sendParentInvites`. Shows progress + per-email failures.

---

## Architecture

### File layout

```
app-next/app/dashboard/roster-import/
├── page.tsx              # Server component: auth + club_id, renders <ImportWizard />
├── import-wizard.tsx     # Client component: 3-step UI state
├── actions.ts            # Server actions
└── lib/
    ├── se-column-aliases.ts  # Known SE column names → OffPitchOS field
    ├── normalize.ts          # phone / email / name / date normalization
    └── types.ts              # ParsedRow, ColumnMapping, PreviewResult, CommitResult
```

Mount points:
- `app/onboarding/wizard.tsx` — new step 3 embeds `<ImportWizard variant="onboarding" />`.
- `app/dashboard/teams/page.tsx` — "Import roster" button → `/dashboard/roster-import`.
- `app/dashboard/settings/page.tsx` — link to `/dashboard/roster-import`.

### Server actions

All return the project-standard `{ ok: true, data } | { ok: false, error }` shape.

```typescript
'use server'

// Pure validation. NO database writes. Returns counts, warnings, errors.
previewImport(rows, mapping): Promise<PreviewResult>

// Bulk-creates auth.users + profiles + team_members + teams + players.
// Service-role client (matches demo-seed-actions.ts pattern).
// Empty-state guard at the top for onboarding variant.
commitImport(rows, mapping): Promise<CommitResult>

// Bulk-sends Supabase password-recovery emails for the given parent
// auth.user.ids — "Click here to set your password and log in."
sendParentRecoveryEmails(parentUserIds: string[]): Promise<RecoveryResult>
```

CSV parsing happens client-side (papaparse). No `parseCsv` server action — parsed rows ride over the wire to `previewImport` / `commitImport`.

### Reused patterns

- `createServiceClient` from `@/lib/supabase/service` — RLS bypass for bulk insert (matches `seedDemoData`).
- `bustAttentionCache(clubId)` after commit — so attention panels see new data.
- `revalidatePath('/dashboard/teams')` after commit.
- Existing `/join/[token]` flow — handles parent acceptance after invite send.

### Dependencies

- `papaparse` — CSV parsing. Add to `package.json` if not already present (~45KB).
- No other new dependencies.

---

## Data model

### Critical schema fact

`players.parent_id` is `NOT NULL` and references `auth.users(id)` (per `009_players.sql`). There is no separate `parents` table — a "parent" in OffPitchOS is an `auth.users` row + a `profiles` row with `role='parent'`. The importer cannot create freestanding parent records.

### Bootstrap pattern (matches demo-seed exactly)

Verified against `app-next/app/dashboard/demo-seed-actions.ts:208-244`. For each unique parent email in the CSV the importer:

1. Creates an `auth.users` row via `admin.auth.admin.createUser({ email, password: cryptoRandomPassword(), email_confirm: true, user_metadata: { full_name } })`. The `email_confirm: true` flag suppresses the Supabase confirmation email — silent creation. Random password means the parent can't sign in until they trigger a reset.
2. Creates a `profiles` row with `role='parent'`, linked to that `auth.user.id` and the club.
3. Creates a `team_members` row per team that parent has at least one player on (links profile → team).
4. Creates `players` rows with `parent_id = auth.user.id`.

After import, parents exist as "set up but not yet active" accounts. They become active when the DOC clicks "Send invites" in Phase 3, which dispatches a Supabase password-recovery email per parent ("Click here to set your password and log in"). No `/join`-token invite path is used by this importer — that path stays untouched and continues to serve manual invites added through the existing dashboard UI.

### Sibling case

A CSV with two rows for siblings sharing `parent1_email`:

| Row | Player | parent1_email |
|---|---|---|
| 1 | Mateo Lopez | anna@... |
| 2 | Sofia Lopez | anna@... |

Result: ONE `auth.users` row created for `anna@...`, ONE `profiles` row, `team_members` rows for each team Anna's kids are on (deduped), and 2 `players` rows both pointing to Anna's single `parent_id`. ONE password-recovery email when "Send invites" is clicked. When Anna clicks the link, sets her password, signs in — she sees both Mateo and Sofia under her account immediately.

### Required CSV fields

| Field | Required | Notes |
|---|---|---|
| player_first_name | ✅ | |
| player_last_name | ✅ | |
| team_name | ✅ | Case-insensitive match against existing teams in the club. New if no match. |
| team_age_group | ✅* | Required only when team is new. Ignored if team exists. |
| parent1_email | ✅ | Used for invite + dedup. |
| parent1_first_name |  | Falls back to "Parent" in invite emails if missing. |
| parent1_phone |  | |
| parent2_email |  | If present, creates a second invite for the same player. |
| jersey_number |  | |
| position |  | |
| date_of_birth |  | Try ISO, US (MM/DD/YYYY), UK (DD/MM/YYYY). Ambiguous → null + warning. |

### SE alias dictionary (`se-column-aliases.ts`)

~30 entries mapping known column names to OffPitchOS fields. Examples:

| SE / common column | OffPitchOS field |
|---|---|
| Member First Name, First Name, Player First Name | player_first_name |
| Member Last Name, Last Name, Player Last Name | player_last_name |
| Team Name, Roster, Squad | team_name |
| Age Group, Birth Year, Division | team_age_group |
| Parent 1 Email, Email Address, Email | parent1_email |
| Parent 1 First Name, Guardian First Name | parent1_first_name |
| Phone, Mobile Phone, Cell, Parent Phone | parent1_phone |
| Parent 2 Email, Secondary Email | parent2_email |

Mapper UI uses these for pre-population but the DOC can edit any mapping.

### Dedup rules

| Concern | Rule |
|---|---|
| Player dup within CSV | Match `(first + last + team)` lowercased. Drop dup, preview warning. |
| Parent dup within CSV | Match lowercased `parent1_email`. One invite per (parent, player). At acceptance time, one `auth.users` row regardless of how many invites use that email. |
| Conflict against existing club data (onboarding path) | Block via empty-state guard (matches `getDemoSeedState` logic). Onboarding path requires 0 existing players. |
| Conflict against existing club data (dashboard path) | Yellow confirm dialog: "Adding to N existing players. No duplicate detection. Continue?" No rollback. |

### Tables written

| Table | Operation | Notes |
|---|---|---|
| `auth.users` | INSERT (via `admin.auth.admin.createUser`) | One per unique parent email. `email_confirm: true`, random password, `user_metadata.full_name` set. |
| `profiles` | INSERT | One per parent (linked to the `auth.user.id` above). `role='parent'`, `club_id`, `display_name`. |
| `team_members` | INSERT | One per (parent profile, team) pair. Deduped within import (a parent with two siblings on the same team gets one row). |
| `teams` | INSERT | One per new team_name not already in club. age_group from CSV. |
| `players` | INSERT | One per CSV row (post-dedup). `parent_id` = the parent's `auth.user.id` from above. `team_id` from match-or-create. |

No writes to the `invites` table from this importer. The existing `/join`-token flow stays in place for manual invites added through the dashboard.

### Normalization (applied silently during preview)

- Emails: lowercased, trimmed.
- Phones: stripped of non-digits. If 10 digits → `(XXX) XXX-XXXX`. Else stored raw.
- Names: trimmed, casing preserved.
- Team names: case-insensitive match against existing teams. New team uses CSV casing as-is.

---

## Error handling

### Preview-stage errors (block confirm)

| Condition | Handling |
|---|---|
| CSV unparseable / 0 data rows | Error: "CSV has no data rows" |
| Required column not mapped | Error: "Map column for {field}" |
| All rows have fatal errors | Error: "No importable rows" |
| Empty-state guard fails (onboarding) | Error: "Roster import on onboarding requires an empty club. Use the dashboard to add to existing teams." |

### Preview-stage warnings (don't block, show inline with row numbers)

| Condition | Handling |
|---|---|
| Row missing parent1_email | Skip row, warn |
| Row missing player_first_name or player_last_name | Skip row, warn |
| Player dup within CSV | Drop dup, warn "row N duplicate of row M" |
| Email regex fails | Skip row, warn |
| Phone unparseable | Store raw, warn |
| date_of_birth ambiguous | Store null, warn |
| Team age_group mismatch with existing team | Use existing team's age_group, warn |
| Re-import to populated club (dashboard path) | Yellow dialog before allowing confirm |

### Commit-stage

- Single transaction (Postgres) wraps all writes per `commitImport` call. If any insert fails, the whole transaction rolls back; caller sees `{ ok: false, error }` and stays on preview.
- Row cap (1000) enforced at preview gate to prevent timeouts. Service-role bulk insert of 1000 rows is sub-second.

### Invite-send stage (`sendParentRecoveryEmails`)

- For each parent `auth.user.id`, server calls `admin.auth.admin.generateLink({ type: 'recovery', email })` to mint a one-time recovery link, then sends a Resend email with a "Set your password" CTA pointing at that link.
- Per-email Resend call (individual `to:` addresses, no shared thread).
- Returns `{ sent, failed, failures: [{ email, reason }] }`.
- UI shows progress + failure list. "Retry failed" can be re-clicked safely — `generateLink` invalidates prior recovery tokens for that user, so re-sends always work but only the latest link is valid.
- Idempotency note: re-clicking after a parent has already reset their password is harmless — they'll just get a new link they don't need.

### Concurrency / race

- "Confirm import" button disables on click.
- Concurrent confirm calls (two browser tabs) → second hits empty-state guard (now > 0 players) and bounces. Safe.
- "Send invites" button shows in-progress state during call. Re-click during in-flight call → no-op (button disabled).

### State

- Parsed CSV rows held in client `useState`. Survives within the wizard but lost on browser refresh. No persistence in v1 — DOC re-uploads from scratch.

---

## Acceptance criteria

A founding-club DOC can:

1. Sign up → reach onboarding step 3 → upload an SE roster CSV → see a preview with correct counts and reasonable warnings → click confirm → see all teams/players in their dashboard within 10 minutes of starting onboarding.
2. From the dashboard, after onboarding is complete, upload an additional roster CSV (e.g., a new team) → confirm → see the new players appended.
3. Click "Send invites" on the success screen → all parents receive a Supabase password-recovery email → at least one parent clicks the link, sets their password, signs in, and lands on the dashboard with their child's player record(s) already attached.
4. If the CSV has bad rows (missing emails, malformed dates, dups), the preview surfaces them clearly with row numbers and the DOC can either fix the CSV or proceed with the warning rows skipped.

A bug-free implementation does not:

- Create duplicate `auth.users` rows for the same email within an import.
- Send any email automatically during the upload/preview/commit phases — Supabase confirmation is suppressed via `email_confirm: true`, and recovery emails only go out on explicit "Send invites" click.
- Bypass RLS or club_id scoping on any read.
- Allow > 1000 rows to be committed in a single import.

Acceptable side effect (documented for the founding-club DOC): all parents in the CSV will exist as `auth.users` rows with random passwords from the moment of import. They are inert until the DOC clicks "Send invites" and they reset their password. This is the same pattern demo-seed uses for fixture parents and is by design.

---

## Open questions for implementation

1. ~~Confirm `papaparse` not already in `package.json`. If absent, add it.~~ → Verified MISSING; Task 1 adds it.
2. ~~Confirm demo-seed pattern for `parent_id` placeholder.~~ → Verified 2026-05-04. Demo-seed creates real `auth.users` via `admin.createUser` with `email_confirm: true`. Spec updated to match.
3. Confirm Resend's per-call latency at scale (sending 60 emails sequentially) — if > 30s, consider batching with a queue. Likely fine for v1 sizes.
4. Confirm `admin.auth.admin.generateLink({ type: 'recovery' })` returns a usable URL we can embed in our own Resend email (vs. Supabase auto-sending). Should be fine — that's the documented use case for `generateLink`.

---

## Files to be created / modified

**New files:**
- `app-next/app/dashboard/roster-import/page.tsx`
- `app-next/app/dashboard/roster-import/import-wizard.tsx`
- `app-next/app/dashboard/roster-import/actions.ts`
- `app-next/app/dashboard/roster-import/lib/se-column-aliases.ts`
- `app-next/app/dashboard/roster-import/lib/normalize.ts`
- `app-next/app/dashboard/roster-import/lib/types.ts`

**Modified files:**
- `app-next/app/onboarding/wizard.tsx` — add step 3.
- `app-next/app/onboarding/actions.ts` — confirm step 3 doesn't break the existing 2-step submit.
- `app-next/app/dashboard/teams/page.tsx` — add "Import roster" button.
- `app-next/app/dashboard/settings/page.tsx` — add link.
- `app-next/package.json` — add `papaparse` if missing.

**No new migration required.** The existing schema (teams, players, invites with player_id) supports everything in this spec.
