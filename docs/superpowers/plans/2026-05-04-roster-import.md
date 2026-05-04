# Roster Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a CSV roster importer (SportsEngine-shaped, generic-fallback column mapper) that lets a switching DOC migrate teams + players + parents into OffPitchOS in ~10 minutes.

**Architecture:** Client-side CSV parsing (papaparse) → column mapping UI → server-side validation preview → service-role bulk insert (matches `demo-seed-actions.ts` pattern) → optional bulk parent invite via existing `/join` flow + Resend.

**Tech Stack:** Next.js 16 App Router, React 19, Supabase (Postgres + service-role for bulk inserts), papaparse, Resend, Tailwind. No new migration. No tests (per CLAUDE.md "ship fast" preference — manual smoke at each phase boundary).

**Spec:** `docs/superpowers/specs/2026-05-04-roster-import-design.md`

**Phasing for shippable increments:**

- **Phase 1** — Onboarding step-3 happy path. End state: a DOC can upload an SE CSV during onboarding and land on a populated dashboard. No bulk invite yet (parents stay as ghost-invites).
- **Phase 2** — Dashboard re-import path. End state: DOC can upload additional rosters after onboarding from `/dashboard/roster-import`.
- **Phase 3** — Bulk parent invite send. End state: success screen has a "Send invites to N parents" button that completes the migration story.

Each phase is a shippable Vercel deploy. Solo founder bar: **Phase 1 deploys before next demo**, P2/P3 follow within the 2-week window.

---

## Task 0: Verify spec assumptions (15 min, no commits)

**Files (read-only):**
- `app-next/package.json` — confirm `papaparse` presence
- `app-next/app/dashboard/demo-seed-actions.ts` — confirm `parent_id` placeholder pattern
- Any existing dashboard add-player UX (search for player INSERT calls)

- [ ] **Step 1: Check papaparse**

```bash
grep -E '"papaparse"' app-next/package.json && echo "PRESENT" || echo "MISSING"
```

If MISSING, queue for Task 1.

- [ ] **Step 2: Read demo-seed parent_id pattern**

```bash
grep -A 20 'parent_id\|parents:' app-next/app/dashboard/demo-seed-actions.ts | head -50
```

Confirm: does demo-seed use DOC's user_id as placeholder, OR create temp auth.users for demo parents? If different from spec assumption, update spec section "Bootstrap pattern" before proceeding.

- [ ] **Step 3: Find any existing player-creation pattern in dashboard**

```bash
grep -rn "from('players').*insert\|players.insert" app-next/app/ | head -5
```

If existing UX uses a different pattern than demo-seed, plan must follow whichever pattern handles the player→parent linkage in production (not demo). Document the choice in a top-of-file comment in `actions.ts` (Task 5).

- [ ] **Step 4: No commit** — this is a discovery task

---

# PHASE 1 — Onboarding step-3 happy path

**Phase 1 ships when:** A DOC signing up fresh can drop an SE CSV at onboarding step 3 → see preview with team/player counts + warnings → click confirm → land on dashboard with all teams + players visible. Parents exist as `invites` rows (ghost) — no emails sent yet. Subagent demo CSV provided in `app-next/app/dashboard/roster-import/lib/sample-se-export.csv` for manual smoke.

## Task 1: Scaffolding + types + papaparse

**Files:**
- Create: `app-next/app/dashboard/roster-import/lib/types.ts`
- Modify: `app-next/package.json` (only if Task 0 found papaparse missing)

- [ ] **Step 1: Add papaparse if missing**

```bash
cd app-next && npm install papaparse @types/papaparse
```

- [ ] **Step 2: Create `lib/types.ts`**

```typescript
// app-next/app/dashboard/roster-import/lib/types.ts

export type OffPitchField =
  | 'player_first_name'
  | 'player_last_name'
  | 'team_name'
  | 'team_age_group'
  | 'parent1_email'
  | 'parent1_first_name'
  | 'parent1_phone'
  | 'parent2_email'
  | 'jersey_number'
  | 'position'
  | 'date_of_birth'

export const REQUIRED_FIELDS: OffPitchField[] = [
  'player_first_name',
  'player_last_name',
  'team_name',
  'parent1_email',
]

// CSV header → OffPitchOS field. Empty string = unmapped.
export type ColumnMapping = Record<string, OffPitchField | ''>

export interface ParsedRow {
  // Original CSV row by header name
  raw: Record<string, string>
  // Source row number for warnings (1-indexed, header = row 0)
  rowNumber: number
}

export interface RowWarning {
  rowNumber: number
  field?: OffPitchField
  message: string
}

export interface RowError {
  rowNumber: number
  message: string
}

export interface PreviewResult {
  ok: true
  data: {
    counts: {
      newTeams: number
      newPlayers: number
      uniqueParentEmails: number  // = parents that will be created
      existingPlayerCount: number  // for re-import dialog (Phase 2)
    }
    teamsToCreate: { name: string; age_group: string }[]
    teamsExisting: { name: string; id: string }[]
    siblingGroups: { email: string; playerCount: number }[]
    warnings: RowWarning[]
    skippedRows: number
    blockingErrors: RowError[]
  }
}

export interface CommitResult {
  ok: true
  data: {
    teamsCreated: number
    playersCreated: number
    parentsCreated: number
    parentUserIds: string[]  // for Phase 3 sendParentRecoveryEmails
  }
}

export interface ActionFailure {
  ok: false
  error: string
}
```

- [ ] **Step 3: Commit**

```bash
git add app-next/app/dashboard/roster-import/lib/types.ts app-next/package.json app-next/package-lock.json
git commit -m "feat(roster-import): scaffold types + add papaparse dep"
```

---

## Task 2: SE column alias dictionary

**Files:**
- Create: `app-next/app/dashboard/roster-import/lib/se-column-aliases.ts`

- [ ] **Step 1: Create the alias map**

```typescript
// app-next/app/dashboard/roster-import/lib/se-column-aliases.ts
import { OffPitchField } from './types'

// Lowercased alias → field. Compared case-insensitively.
export const SE_COLUMN_ALIASES: Record<string, OffPitchField> = {
  // Player names
  'member first name': 'player_first_name',
  'first name': 'player_first_name',
  'player first name': 'player_first_name',
  'firstname': 'player_first_name',
  'member last name': 'player_last_name',
  'last name': 'player_last_name',
  'player last name': 'player_last_name',
  'lastname': 'player_last_name',

  // Team
  'team name': 'team_name',
  'team': 'team_name',
  'roster': 'team_name',
  'squad': 'team_name',
  'team / roster': 'team_name',

  'age group': 'team_age_group',
  'age': 'team_age_group',
  'birth year': 'team_age_group',
  'division': 'team_age_group',

  // Parent 1
  'parent 1 email': 'parent1_email',
  'parent email': 'parent1_email',
  'guardian email': 'parent1_email',
  'email address': 'parent1_email',
  'email': 'parent1_email',
  'parent 1 first name': 'parent1_first_name',
  'parent first name': 'parent1_first_name',
  'guardian first name': 'parent1_first_name',
  'parent name': 'parent1_first_name',
  'phone': 'parent1_phone',
  'parent phone': 'parent1_phone',
  'mobile phone': 'parent1_phone',
  'cell': 'parent1_phone',
  'cell phone': 'parent1_phone',
  'parent 1 phone': 'parent1_phone',

  // Parent 2
  'parent 2 email': 'parent2_email',
  'secondary email': 'parent2_email',
  'guardian 2 email': 'parent2_email',

  // Player extras
  'jersey number': 'jersey_number',
  'jersey #': 'jersey_number',
  '#': 'jersey_number',
  'position': 'position',
  'date of birth': 'date_of_birth',
  'dob': 'date_of_birth',
  'birthday': 'date_of_birth',
  'birthdate': 'date_of_birth',
}

// Returns suggested mapping for a list of CSV headers.
// Headers that don't match any alias map to '' (unmapped).
export function suggestMapping(headers: string[]): Record<string, OffPitchField | ''> {
  const mapping: Record<string, OffPitchField | ''> = {}
  for (const h of headers) {
    mapping[h] = SE_COLUMN_ALIASES[h.trim().toLowerCase()] ?? ''
  }
  return mapping
}
```

- [ ] **Step 2: Commit**

```bash
git add app-next/app/dashboard/roster-import/lib/se-column-aliases.ts
git commit -m "feat(roster-import): SE column alias dictionary + suggestMapping helper"
```

---

## Task 3: Normalization helpers

**Files:**
- Create: `app-next/app/dashboard/roster-import/lib/normalize.ts`

- [ ] **Step 1: Implement normalizers**

```typescript
// app-next/app/dashboard/roster-import/lib/normalize.ts

export function normalizeEmail(raw: string): string | null {
  const v = raw?.trim().toLowerCase() ?? ''
  if (!v) return null
  // Loose check — proper validation happens at preview-warning time
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return null
  return v
}

export function isValidEmail(raw: string): boolean {
  return normalizeEmail(raw) !== null
}

export function normalizePhone(raw: string): string {
  const digits = (raw ?? '').replace(/\D/g, '')
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  return raw?.trim() ?? ''
}

// Try ISO, US (M/D/YYYY), UK (D/M/YYYY). Returns ISO date string or null.
// If ambiguous (both US and UK could parse to different dates), returns null + sets ambiguous=true.
export function normalizeDate(raw: string): { iso: string | null; ambiguous: boolean } {
  const v = (raw ?? '').trim()
  if (!v) return { iso: null, ambiguous: false }

  // ISO YYYY-MM-DD
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  if (iso) {
    const [, y, m, d] = iso
    if (isValidYMD(+y, +m, +d)) return { iso: `${y}-${m}-${d}`, ambiguous: false }
  }

  // Slash-separated M/D/YYYY or D/M/YYYY
  const slash = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(v)
  if (slash) {
    const [, a, b, y] = slash
    const usValid = isValidYMD(+y, +a, +b)
    const ukValid = isValidYMD(+y, +b, +a)
    if (usValid && ukValid && a !== b) return { iso: null, ambiguous: true }
    if (usValid) return { iso: pad(+y, +a, +b), ambiguous: false }
    if (ukValid) return { iso: pad(+y, +b, +a), ambiguous: false }
  }

  return { iso: null, ambiguous: false }
}

function isValidYMD(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return false
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

function pad(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function trimName(raw: string): string {
  return (raw ?? '').trim()
}

// Lowercase + collapse whitespace for case-insensitive team-name matching.
export function teamKey(name: string): string {
  return (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}
```

- [ ] **Step 2: Quick smoke at the dev server console (no test file)**

```bash
cd app-next && node -e "
const n = require('./app/dashboard/roster-import/lib/normalize.ts');
console.log(n.normalizePhone('954-555-1234'));  // (954) 555-1234
console.log(n.normalizePhone('19545551234'));   // (954) 555-1234
console.log(n.normalizeEmail('  Jozo@TEST.com '));  // jozo@test.com
console.log(n.normalizeDate('2014-03-15'));     // { iso: '2014-03-15', ambiguous: false }
console.log(n.normalizeDate('3/15/2014'));      // { iso: '2014-03-15', ambiguous: false }
console.log(n.normalizeDate('5/4/2014'));       // { iso: null, ambiguous: true }
"
```

(If TS won't run via `node` directly, skip — verify in the browser when wizard is wired up.)

- [ ] **Step 3: Commit**

```bash
git add app-next/app/dashboard/roster-import/lib/normalize.ts
git commit -m "feat(roster-import): email/phone/date/team normalizers"
```

---

## Task 4: previewImport server action

**Files:**
- Create: `app-next/app/dashboard/roster-import/actions.ts`

- [ ] **Step 1: Implement previewImport**

```typescript
// app-next/app/dashboard/roster-import/actions.ts
'use server'

// IMPORTANT: This module assumes the DOC's user_id is used as a placeholder
// `players.parent_id` until parent claims via the existing /join player-scoped
// invite flow. This matches the demo-seed bulk-insert pattern. If the
// dashboard add-player UX uses a different mechanism, update this comment
// and the commitImport implementation to match.

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import { bustAttentionCache } from '../attention-actions'
import {
  ColumnMapping,
  ParsedRow,
  PreviewResult,
  CommitResult,
  RowWarning,
  RowError,
  ActionFailure,
  REQUIRED_FIELDS,
} from './lib/types'
import { isValidEmail, normalizeEmail, normalizePhone, normalizeDate, trimName, teamKey } from './lib/normalize'

const MAX_ROWS = 1000

export async function previewImport(
  rows: ParsedRow[],
  mapping: ColumnMapping,
  variant: 'onboarding' | 'dashboard'
): Promise<PreviewResult | ActionFailure> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, club_id, role')
    .eq('user_id', user.id)
    .single()
  if (!profile?.club_id || profile.role !== 'doc') {
    return { ok: false, error: 'DOC role required' }
  }

  // Row cap
  if (rows.length > MAX_ROWS) {
    return { ok: false, error: `Row cap is ${MAX_ROWS}. Split your CSV.` }
  }

  // Required-field-mapped check
  const mappedFields = new Set(Object.values(mapping).filter(Boolean))
  for (const required of REQUIRED_FIELDS) {
    if (!mappedFields.has(required)) {
      return { ok: false, error: `Map a column to "${required}" before previewing.` }
    }
  }

  // Empty-state guard for onboarding path
  if (variant === 'onboarding') {
    const { count } = await supabase
      .from('players')
      .select('id', { count: 'exact', head: true })
      .eq('club_id', profile.club_id)
    if ((count ?? 0) > 0) {
      return {
        ok: false,
        error: 'Onboarding import requires an empty club. Use the dashboard import for additional teams.',
      }
    }
  }

  // Resolve mapping helper
  const fieldToHeader = (field: string): string | null => {
    for (const [header, mapped] of Object.entries(mapping)) {
      if (mapped === field) return header
    }
    return null
  }
  const get = (row: ParsedRow, field: string): string => {
    const header = fieldToHeader(field)
    return header ? (row.raw[header] ?? '').toString() : ''
  }

  // Existing teams (for match)
  const { data: existingTeams } = await supabase
    .from('teams')
    .select('id, name, age_group')
    .eq('club_id', profile.club_id)
  const teamByKey = new Map((existingTeams ?? []).map(t => [teamKey(t.name), t]))

  // Per-row validation + dedup
  const warnings: RowWarning[] = []
  const blockingErrors: RowError[] = []
  let skippedRows = 0
  const seenPlayerKeys = new Set<string>()
  const teamsToCreateMap = new Map<string, { name: string; age_group: string }>()
  const parentEmails = new Set<string>()
  const playersByEmail = new Map<string, number>()  // email → # of players, for sibling-group display
  let importablePlayerCount = 0

  // Existing player count (for re-import dialog in dashboard variant)
  const { count: existingPlayerCount } = await supabase
    .from('players')
    .select('id', { count: 'exact', head: true })
    .eq('club_id', profile.club_id)

  for (const row of rows) {
    const firstName = trimName(get(row, 'player_first_name'))
    const lastName = trimName(get(row, 'player_last_name'))
    const teamName = trimName(get(row, 'team_name'))
    const ageGroupRaw = trimName(get(row, 'team_age_group'))
    const parent1EmailRaw = get(row, 'parent1_email')
    const parent2EmailRaw = get(row, 'parent2_email')

    if (!firstName || !lastName) {
      warnings.push({ rowNumber: row.rowNumber, message: 'Missing player name — row skipped' })
      skippedRows++
      continue
    }
    if (!teamName) {
      warnings.push({ rowNumber: row.rowNumber, field: 'team_name', message: 'Missing team — row skipped' })
      skippedRows++
      continue
    }
    const parent1Email = normalizeEmail(parent1EmailRaw)
    if (!parent1Email) {
      warnings.push({
        rowNumber: row.rowNumber,
        field: 'parent1_email',
        message: parent1EmailRaw ? 'Invalid parent email — row skipped' : 'Missing parent email — row skipped',
      })
      skippedRows++
      continue
    }

    // Player dedup within CSV
    const playerKey = `${firstName.toLowerCase()}|${lastName.toLowerCase()}|${teamKey(teamName)}`
    if (seenPlayerKeys.has(playerKey)) {
      warnings.push({ rowNumber: row.rowNumber, message: `Duplicate of an earlier row — skipped` })
      skippedRows++
      continue
    }
    seenPlayerKeys.add(playerKey)

    // Team match-or-create
    const tk = teamKey(teamName)
    const existing = teamByKey.get(tk)
    if (!existing) {
      if (!teamsToCreateMap.has(tk)) {
        if (!ageGroupRaw) {
          warnings.push({
            rowNumber: row.rowNumber,
            field: 'team_age_group',
            message: `New team "${teamName}" — age group required, row skipped`,
          })
          skippedRows++
          continue
        }
        teamsToCreateMap.set(tk, { name: teamName, age_group: ageGroupRaw })
      }
    } else if (ageGroupRaw && ageGroupRaw !== existing.age_group) {
      warnings.push({
        rowNumber: row.rowNumber,
        field: 'team_age_group',
        message: `Team "${existing.name}" exists with age_group "${existing.age_group}" — your "${ageGroupRaw}" ignored`,
      })
    }

    // Phone, DOB warnings (don't skip)
    const phoneRaw = get(row, 'parent1_phone')
    if (phoneRaw && !/\d/.test(phoneRaw)) {
      warnings.push({ rowNumber: row.rowNumber, field: 'parent1_phone', message: 'Phone not parseable — stored as-is' })
    }
    const dobRaw = get(row, 'date_of_birth')
    if (dobRaw) {
      const dob = normalizeDate(dobRaw)
      if (!dob.iso) {
        warnings.push({
          rowNumber: row.rowNumber,
          field: 'date_of_birth',
          message: dob.ambiguous ? 'Date ambiguous (US vs UK) — stored as null' : 'Date unparseable — stored as null',
        })
      }
    }

    parentEmails.add(parent1Email)
    playersByEmail.set(parent1Email, (playersByEmail.get(parent1Email) ?? 0) + 1)
    const parent2Email = normalizeEmail(parent2EmailRaw)
    if (parent2Email && parent2Email !== parent1Email) {
      parentEmails.add(parent2Email)
      playersByEmail.set(parent2Email, (playersByEmail.get(parent2Email) ?? 0) + 1)
    }

    importablePlayerCount++
  }

  if (importablePlayerCount === 0) {
    blockingErrors.push({ rowNumber: 0, message: 'No importable rows after validation' })
  }

  const siblingGroups = Array.from(playersByEmail.entries())
    .filter(([, count]) => count > 1)
    .map(([email, playerCount]) => ({ email, playerCount }))

  return {
    ok: true,
    data: {
      counts: {
        newTeams: teamsToCreateMap.size,
        newPlayers: importablePlayerCount,
        uniqueParentEmails: parentEmails.size,
        existingPlayerCount: existingPlayerCount ?? 0,
      },
      teamsToCreate: Array.from(teamsToCreateMap.values()),
      teamsExisting: (existingTeams ?? []).map(t => ({ name: t.name, id: t.id })),
      siblingGroups,
      warnings,
      skippedRows,
      blockingErrors,
    },
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add app-next/app/dashboard/roster-import/actions.ts
git commit -m "feat(roster-import): previewImport server action with validation + dedup"
```

---

## Task 5: commitImport server action

**Files:**
- Modify: `app-next/app/dashboard/roster-import/actions.ts` (append `commitImport` + helpers)
- Reference: `app-next/app/dashboard/demo-seed-actions.ts` lines 200-265 — match this pattern exactly for auth.users + profiles + team_members + players creation.

- [ ] **Step 1: Append a `cryptoRandomPassword()` helper**

Reuse demo-seed's helper if exported; otherwise duplicate it:

```typescript
function cryptoRandomPassword(): string {
  // 24 random bytes → base64url. Long enough to be unguessable; parent will reset.
  const bytes = new Uint8Array(24)
  crypto.getRandomValues(bytes)
  return Buffer.from(bytes).toString('base64url')
}
```

- [ ] **Step 2: Append commitImport**

```typescript
// Append to actions.ts

export async function commitImport(
  rows: ParsedRow[],
  mapping: ColumnMapping,
  variant: 'onboarding' | 'dashboard'
): Promise<CommitResult | ActionFailure> {
  // Re-run preview server-side as the source of truth — never trust client data
  const preview = await previewImport(rows, mapping, variant)
  if (!preview.ok) return preview
  if (preview.data.blockingErrors.length > 0) {
    return { ok: false, error: 'Preview has blocking errors' }
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, club_id, role')
    .eq('user_id', user.id)
    .single()
  if (!profile?.club_id || profile.role !== 'doc') {
    return { ok: false, error: 'DOC role required' }
  }

  const service = createServiceClient()
  const clubId = profile.club_id

  // Field-getter (matches previewImport)
  const fieldToHeader = (field: string): string | null => {
    for (const [header, mapped] of Object.entries(mapping)) {
      if (mapped === field) return header
    }
    return null
  }
  const get = (row: ParsedRow, field: string): string => {
    const header = fieldToHeader(field)
    return header ? (row.raw[header] ?? '').toString() : ''
  }

  // 1) Insert new teams
  const teamInserts = preview.data.teamsToCreate.map(t => ({
    club_id: clubId,
    name: t.name,
    age_group: t.age_group,
  }))
  let teamsCreated = 0
  let allTeams = preview.data.teamsExisting.map(t => ({ id: t.id, name: t.name }))

  if (teamInserts.length > 0) {
    const { data: insertedTeams, error: teamErr } = await service
      .from('teams')
      .insert(teamInserts)
      .select('id, name')
    if (teamErr) return { ok: false, error: `Team insert failed: ${teamErr.message}` }
    teamsCreated = insertedTeams?.length ?? 0
    allTeams = allTeams.concat(insertedTeams ?? [])
  }
  const teamIdByKey = new Map(allTeams.map(t => [teamKey(t.name), t.id]))

  // 2) Pass 1 — collect unique parents (deduped by email) + which teams each is on
  type ParentRecord = {
    email: string
    firstName: string  // for invite metadata (display_name)
    lastName: string
    phone: string
    teamIds: Set<string>  // unique teams this parent has at least one player on
  }
  const parentByEmail = new Map<string, ParentRecord>()
  const seenPlayerKeys = new Set<string>()

  for (const row of rows) {
    const firstName = trimName(get(row, 'player_first_name'))
    const lastName = trimName(get(row, 'player_last_name'))
    const teamName = trimName(get(row, 'team_name'))
    const parent1Email = normalizeEmail(get(row, 'parent1_email'))
    if (!firstName || !lastName || !teamName || !parent1Email) continue
    const teamId = teamIdByKey.get(teamKey(teamName))
    if (!teamId) continue

    const playerKey = `${firstName.toLowerCase()}|${lastName.toLowerCase()}|${teamKey(teamName)}`
    if (seenPlayerKeys.has(playerKey)) continue
    seenPlayerKeys.add(playerKey)

    // Parent 1
    let p1 = parentByEmail.get(parent1Email)
    if (!p1) {
      p1 = {
        email: parent1Email,
        firstName: trimName(get(row, 'parent1_first_name')) || 'Parent',
        lastName: lastName,  // best guess: parent shares player's last name
        phone: normalizePhone(get(row, 'parent1_phone')),
        teamIds: new Set(),
      }
      parentByEmail.set(parent1Email, p1)
    }
    p1.teamIds.add(teamId)

    // Parent 2 (optional)
    const parent2Email = normalizeEmail(get(row, 'parent2_email'))
    if (parent2Email && parent2Email !== parent1Email) {
      let p2 = parentByEmail.get(parent2Email)
      if (!p2) {
        p2 = {
          email: parent2Email,
          firstName: 'Parent',
          lastName: lastName,
          phone: '',
          teamIds: new Set(),
        }
        parentByEmail.set(parent2Email, p2)
      }
      p2.teamIds.add(teamId)
    }
  }

  // 3) Create auth.users + profiles + team_members for each unique parent.
  // Pattern matches demo-seed-actions.ts lines 208-244 exactly.
  const parentUserIdByEmail = new Map<string, string>()
  for (const parent of parentByEmail.values()) {
    const { data: created, error: authErr } = await service.auth.admin.createUser({
      email: parent.email,
      password: cryptoRandomPassword(),
      email_confirm: true,
      user_metadata: {
        full_name: `${parent.firstName} ${parent.lastName}`.trim(),
        imported_at: new Date().toISOString(),
      },
    })
    if (authErr || !created.user) {
      // If the email already exists in auth.users, skip (likely a parent
      // already in another club). Surface as a partial-success warning later.
      // For v1: hard fail. We can soften in v2 if it bites.
      return { ok: false, error: `Failed to create parent ${parent.email}: ${authErr?.message ?? 'unknown'}` }
    }
    const authId = created.user.id
    parentUserIdByEmail.set(parent.email, authId)

    const { data: insertedProfile, error: profileErr } = await service
      .from('profiles')
      .insert({
        user_id: authId,
        club_id: clubId,
        role: 'parent',
        display_name: `${parent.firstName} ${parent.lastName}`.trim(),
        onboarding_complete: true,
      })
      .select('id')
      .single()
    if (profileErr || !insertedProfile) {
      return { ok: false, error: `Failed to create profile for ${parent.email}: ${profileErr?.message}` }
    }

    if (parent.teamIds.size > 0) {
      const memberInserts = Array.from(parent.teamIds).map(teamId => ({
        team_id: teamId,
        profile_id: insertedProfile.id,
        role: 'parent',
      }))
      const { error: memberErr } = await service.from('team_members').insert(memberInserts)
      if (memberErr) {
        return { ok: false, error: `Failed to link ${parent.email} to teams: ${memberErr.message}` }
      }
    }
  }

  // 4) Pass 2 — insert players with parent_id pointing at the real auth.user.id
  const playerInserts: any[] = []
  const seenPlayerKeys2 = new Set<string>()

  for (const row of rows) {
    const firstName = trimName(get(row, 'player_first_name'))
    const lastName = trimName(get(row, 'player_last_name'))
    const teamName = trimName(get(row, 'team_name'))
    const parent1Email = normalizeEmail(get(row, 'parent1_email'))
    if (!firstName || !lastName || !teamName || !parent1Email) continue

    const playerKey = `${firstName.toLowerCase()}|${lastName.toLowerCase()}|${teamKey(teamName)}`
    if (seenPlayerKeys2.has(playerKey)) continue
    seenPlayerKeys2.add(playerKey)

    const teamId = teamIdByKey.get(teamKey(teamName))
    if (!teamId) continue
    const parentId = parentUserIdByEmail.get(parent1Email)
    if (!parentId) continue  // shouldn't happen — we just created them

    const dob = normalizeDate(get(row, 'date_of_birth'))
    const jerseyRaw = get(row, 'jersey_number').replace(/\D/g, '')
    playerInserts.push({
      club_id: clubId,
      team_id: teamId,
      parent_id: parentId,
      first_name: firstName,
      last_name: lastName,
      jersey_number: jerseyRaw ? parseInt(jerseyRaw, 10) : null,
      position: trimName(get(row, 'position')) || null,
      date_of_birth: dob.iso,
    })
  }

  if (playerInserts.length === 0) {
    return { ok: false, error: 'No importable rows after parent creation' }
  }

  const { data: insertedPlayers, error: playerErr } = await service
    .from('players')
    .insert(playerInserts)
    .select('id')
  if (playerErr) return { ok: false, error: `Player insert failed: ${playerErr.message}` }

  // Cache busts
  await bustAttentionCache(clubId)
  revalidatePath('/dashboard/teams')
  revalidatePath('/dashboard')

  return {
    ok: true,
    data: {
      teamsCreated,
      playersCreated: insertedPlayers?.length ?? 0,
      parentsCreated: parentByEmail.size,
      parentUserIds: Array.from(parentUserIdByEmail.values()),  // for Phase 3 sendParentRecoveryEmails
    },
  }
}
```

Update `CommitResult` in `lib/types.ts` to include `parentsCreated: number` and `parentUserIds: string[]`.

- [ ] **Step 3: Verify the `profiles` schema accepts these columns**

```bash
grep -A 15 "create table profiles\|CREATE TABLE profiles" supabase/migrations/001_initial_schema.sql
```

Confirm: `user_id`, `club_id`, `role`, `display_name`, `onboarding_complete` all exist. If `onboarding_complete` is named differently, adjust.

- [ ] **Step 4: Commit**

```bash
git add app-next/app/dashboard/roster-import/actions.ts app-next/app/dashboard/roster-import/lib/types.ts
git commit -m "feat(roster-import): commitImport — auth.users + profiles + team_members + players (matches demo-seed pattern)"
```

---

## Task 6: ImportWizard client component (3 steps)

**Files:**
- Create: `app-next/app/dashboard/roster-import/import-wizard.tsx`

- [ ] **Step 1: Implement the 3-step wizard**

Skeleton (full implementation needs Tailwind styling matching existing dashboard patterns — match `onboarding/wizard.tsx` for typography + buttons):

```typescript
// app-next/app/dashboard/roster-import/import-wizard.tsx
'use client'

import { useState, useTransition } from 'react'
import Papa from 'papaparse'
import { previewImport, commitImport } from './actions'
import { suggestMapping } from './lib/se-column-aliases'
import {
  ColumnMapping,
  ParsedRow,
  PreviewResult,
  OffPitchField,
  REQUIRED_FIELDS,
} from './lib/types'

type Step = 'upload' | 'map' | 'preview' | 'success'

const ALL_FIELDS: OffPitchField[] = [
  'player_first_name',
  'player_last_name',
  'team_name',
  'team_age_group',
  'parent1_email',
  'parent1_first_name',
  'parent1_phone',
  'parent2_email',
  'jersey_number',
  'position',
  'date_of_birth',
]

export default function ImportWizard({
  variant,
  onComplete,
}: {
  variant: 'onboarding' | 'dashboard'
  onComplete?: () => void  // for onboarding, advance to next step
}) {
  const [step, setStep] = useState<Step>('upload')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [mapping, setMapping] = useState<ColumnMapping>({})
  const [preview, setPreview] = useState<PreviewResult['data'] | null>(null)
  const [success, setSuccess] = useState<{ teamsCreated: number; playersCreated: number; invitesCreated: number } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleFile(file: File) {
    setError(null)
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          setError(`CSV parse error: ${results.errors[0].message}`)
          return
        }
        const parsedRows: ParsedRow[] = results.data.map((raw, i) => ({
          raw,
          rowNumber: i + 2,  // header is row 1 in user's mental model
        }))
        if (parsedRows.length === 0) {
          setError('CSV has no data rows')
          return
        }
        const csvHeaders = results.meta.fields ?? []
        setHeaders(csvHeaders)
        setRows(parsedRows)
        setMapping(suggestMapping(csvHeaders))
        setStep('map')
      },
      error: (err) => setError(`Could not parse CSV: ${err.message}`),
    })
  }

  function handlePreview() {
    setError(null)
    startTransition(async () => {
      const res = await previewImport(rows, mapping, variant)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setPreview(res.data)
      setStep('preview')
    })
  }

  function handleConfirm() {
    setError(null)
    startTransition(async () => {
      const res = await commitImport(rows, mapping, variant)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setSuccess(res.data)
      setStep('success')
    })
  }

  // ---- RENDER ----

  if (step === 'upload') {
    return (
      <div className="max-w-xl mx-auto p-6">
        <h2 className="text-2xl font-semibold mb-4">Import roster</h2>
        <p className="text-zinc-400 mb-6">
          Upload a CSV from SportsEngine, TeamSnap, GotSport, or any spreadsheet. We'll auto-map known column names.
        </p>
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
          className="block w-full text-zinc-200"
        />
        {error && <p className="mt-4 text-red-400">{error}</p>}
        {variant === 'onboarding' && (
          <button
            onClick={onComplete}
            className="mt-6 text-zinc-500 underline"
          >
            Skip for now
          </button>
        )}
      </div>
    )
  }

  if (step === 'map') {
    const requiredMissing = REQUIRED_FIELDS.filter(
      f => !Object.values(mapping).includes(f)
    )
    return (
      <div className="max-w-2xl mx-auto p-6">
        <h2 className="text-2xl font-semibold mb-4">Map columns</h2>
        <p className="text-zinc-400 mb-6">
          We've matched what we recognized. Adjust any that look wrong.
        </p>
        <div className="space-y-3">
          {headers.map(h => (
            <div key={h} className="grid grid-cols-2 gap-4 items-center">
              <div className="text-zinc-200">{h}</div>
              <select
                value={mapping[h] ?? ''}
                onChange={(e) => setMapping({ ...mapping, [h]: e.target.value as OffPitchField | '' })}
                className="bg-zinc-800 border border-zinc-700 rounded px-3 py-2"
              >
                <option value="">— don't import —</option>
                {ALL_FIELDS.map(f => (
                  <option key={f} value={f}>
                    {f}{REQUIRED_FIELDS.includes(f) ? ' *' : ''}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
        {requiredMissing.length > 0 && (
          <p className="mt-4 text-red-400">
            Required fields not mapped: {requiredMissing.join(', ')}
          </p>
        )}
        {error && <p className="mt-4 text-red-400">{error}</p>}
        <div className="mt-6 flex gap-3">
          <button onClick={() => setStep('upload')} className="text-zinc-400">Back</button>
          <button
            onClick={handlePreview}
            disabled={requiredMissing.length > 0 || isPending}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2 rounded"
          >
            {isPending ? 'Validating…' : 'Continue to preview'}
          </button>
        </div>
      </div>
    )
  }

  if (step === 'preview' && preview) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <h2 className="text-2xl font-semibold mb-4">Preview</h2>
        <div className="bg-zinc-900 rounded p-4 mb-4">
          <p>{preview.counts.newTeams} new teams</p>
          <p>{preview.counts.newPlayers} new players</p>
          <p>{preview.counts.uniqueParentEmails} parents (one account per unique email — siblings share)</p>
          {preview.skippedRows > 0 && (
            <p className="text-yellow-400">{preview.skippedRows} rows will be skipped</p>
          )}
        </div>
        {preview.siblingGroups.length > 0 && (
          <div className="bg-zinc-900 rounded p-4 mb-4">
            <p className="font-semibold mb-2">Siblings detected:</p>
            {preview.siblingGroups.map(g => (
              <p key={g.email} className="text-sm text-zinc-400">{g.email} — {g.playerCount} players</p>
            ))}
          </div>
        )}
        {preview.warnings.length > 0 && (
          <details className="bg-yellow-950 rounded p-4 mb-4">
            <summary className="cursor-pointer">{preview.warnings.length} warnings</summary>
            <ul className="mt-2 text-sm space-y-1">
              {preview.warnings.map((w, i) => (
                <li key={i}>Row {w.rowNumber}: {w.message}</li>
              ))}
            </ul>
          </details>
        )}
        {preview.blockingErrors.length > 0 && (
          <div className="bg-red-950 rounded p-4 mb-4">
            {preview.blockingErrors.map((e, i) => <p key={i}>{e.message}</p>)}
          </div>
        )}
        {error && <p className="mt-4 text-red-400">{error}</p>}
        <div className="mt-6 flex gap-3">
          <button onClick={() => setStep('map')} className="text-zinc-400">Back to mapping</button>
          <button
            onClick={handleConfirm}
            disabled={preview.blockingErrors.length > 0 || isPending}
            className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 px-4 py-2 rounded"
          >
            {isPending ? 'Importing…' : `Confirm import (${preview.counts.newPlayers} players)`}
          </button>
        </div>
      </div>
    )
  }

  if (step === 'success' && success) {
    return (
      <div className="max-w-xl mx-auto p-6 text-center">
        <h2 className="text-2xl font-semibold mb-4">Import complete ✓</h2>
        <p className="mb-2">{success.teamsCreated} teams · {success.playersCreated} players · {success.parentsCreated} parents created</p>
        <p className="text-zinc-400 mb-6">
          Parent accounts are created but no emails have been sent yet. Use "Send invites" (Phase 3) to email them their password-set links.
        </p>
        {variant === 'onboarding' && onComplete && (
          <button onClick={onComplete} className="bg-emerald-600 hover:bg-emerald-500 px-4 py-2 rounded">
            Continue to dashboard
          </button>
        )}
        {variant === 'dashboard' && (
          <a href="/dashboard/teams" className="text-emerald-400 underline">View teams →</a>
        )}
      </div>
    )
  }

  return null
}
```

- [ ] **Step 2: Build to confirm it compiles**

```bash
cd app-next && npm run build 2>&1 | tail -30
```

Expected: clean build. Fix any TS errors before committing.

- [ ] **Step 3: Commit**

```bash
git add app-next/app/dashboard/roster-import/import-wizard.tsx
git commit -m "feat(roster-import): 3-step wizard component (upload/map/preview/success)"
```

---

## Task 7: Hook into onboarding wizard step 3

**Files:**
- Modify: `app-next/app/onboarding/wizard.tsx` — add step 3
- Modify: `app-next/app/onboarding/actions.ts` — confirm step-3 import doesn't break the existing 2-step submit

- [ ] **Step 1: Read the existing wizard**

```bash
cat app-next/app/onboarding/wizard.tsx | head -80
```

- [ ] **Step 2: Extend wizard.tsx with a step-3 view**

Pattern: keep the existing club-name + team-name flow as steps 1-2. After `completeOnboarding` succeeds, show `<ImportWizard variant="onboarding" onComplete={() => router.push('/dashboard')} />`. Skip button bypasses to `/dashboard`. The user has already been authenticated and has a club_id by the time they hit step 3.

```typescript
// Pseudocode in wizard.tsx
import ImportWizard from '@/app/dashboard/roster-import/import-wizard'
import { useRouter } from 'next/navigation'

// inside component:
const router = useRouter()
// after step === 3:
return (
  <ImportWizard
    variant="onboarding"
    onComplete={() => router.push('/dashboard')}
  />
)
```

The existing `handleSubmit` (which does step 1+2) should set step to 3 instead of redirecting. Verify the redirect path in `actions.ts`.

- [ ] **Step 3: Build + manual smoke**

```bash
cd app-next && npm run build && npm run dev
```

Manual test:
1. Sign up with a fresh email, complete steps 1-2, land on step 3.
2. Drop a small CSV (3 players, 2 teams, 2 parents). See pre-populated mapping.
3. Continue to preview, see counts.
4. Confirm. See success screen.
5. Click "Continue to dashboard." See teams + players.

If anything is broken, fix and rebuild. Don't commit until smoke passes.

- [ ] **Step 4: Commit**

```bash
git add app-next/app/onboarding/wizard.tsx app-next/app/onboarding/actions.ts
git commit -m "feat(onboarding): step 3 — optional roster CSV import"
```

---

## Task 8: Phase 1 ship

- [ ] **Step 1: Final build + lint**

```bash
cd app-next && npm run build && npm run lint
```

- [ ] **Step 2: Push + deploy from repo root**

```bash
git push origin main
vercel --prod --yes
```

(Per project rule: `git push` first, `vercel --prod` from repo root.)

- [ ] **Step 3: Production smoke**

Sign up with a fresh email on offpitchos.com, run the full onboarding-step-3 import flow with a real SE-shaped CSV. Confirm players + teams + invites in Supabase dashboard.

- [ ] **Step 4: Update outreach state memory**

In `~/.claude/projects/-Users-canci27/memory/project_offpitchos_outreach_state.md`, note: "SE-import P1 shipped 2026-MM-DD. Demo story = 'sign up + drop a CSV, your roster is in.'"

**Phase 1 ship criteria met. Move to Phase 2.**

---

# PHASE 2 — Dashboard re-import path

**Phase 2 ships when:** A DOC who's past onboarding can navigate to `/dashboard/roster-import` from Settings or the Teams page, upload another CSV, and append players to existing teams (or new teams).

## Task 9: Dashboard page mount

**Files:**
- Create: `app-next/app/dashboard/roster-import/page.tsx`

- [ ] **Step 1: Create the page**

```typescript
// app-next/app/dashboard/roster-import/page.tsx
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ImportWizard from './import-wizard'

export default async function RosterImportPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id, role')
    .eq('user_id', user.id)
    .single()
  if (!profile?.club_id || profile.role !== 'doc') redirect('/dashboard')

  return (
    <main className="min-h-screen bg-dark text-zinc-100 py-8">
      <ImportWizard variant="dashboard" />
    </main>
  )
}
```

- [ ] **Step 2: Build + commit**

```bash
cd app-next && npm run build
git add app-next/app/dashboard/roster-import/page.tsx
git commit -m "feat(roster-import): /dashboard/roster-import page (variant=dashboard)"
```

---

## Task 10: Entry points (Teams page button + Settings link)

**Files:**
- Modify: `app-next/app/dashboard/teams/page.tsx` — add button
- Modify: `app-next/app/dashboard/settings/page.tsx` — add link

- [ ] **Step 1: Teams page button**

Find the existing "Add team" / page-header area in `teams/page.tsx` and add a secondary button:

```tsx
<a href="/dashboard/roster-import" className="text-emerald-400 hover:text-emerald-300 underline text-sm">
  Import roster from CSV
</a>
```

- [ ] **Step 2: Settings link**

In `settings/page.tsx`, add a section/row:

```tsx
<div className="border-t border-zinc-800 py-4">
  <h3 className="text-lg font-semibold mb-2">Roster import</h3>
  <a href="/dashboard/roster-import" className="text-emerald-400 underline">
    Upload a CSV →
  </a>
</div>
```

- [ ] **Step 3: Build + manual smoke**

```bash
cd app-next && npm run build && npm run dev
```

Visit `/dashboard/teams` and `/dashboard/settings` as a DOC, click the link, land on `/dashboard/roster-import`, run an import that adds to existing teams.

- [ ] **Step 4: Commit**

```bash
git add app-next/app/dashboard/teams/page.tsx app-next/app/dashboard/settings/page.tsx
git commit -m "feat(roster-import): entry points on Teams + Settings pages"
```

---

## Task 11: Re-import safety dialog

**Files:**
- Modify: `app-next/app/dashboard/roster-import/import-wizard.tsx`

For `variant === 'dashboard'` AND existing players in the club > 0, show a yellow dialog before allowing the preview→confirm transition. The previewImport server action already returns counts; client-side check `preview.data.teamsExisting.length > 0` is a reasonable proxy. Better: have previewImport return an `existingPlayerCount` field.

- [ ] **Step 1: Add `existingPlayerCount` to PreviewResult**

In `actions.ts/previewImport`, add:

```typescript
const { count: existingPlayerCount } = await supabase
  .from('players')
  .select('id', { count: 'exact', head: true })
  .eq('club_id', profile.club_id)
```

Return it in `data.counts.existingPlayerCount`. Update `types.ts` to match.

- [ ] **Step 2: Wire confirmation dialog in import-wizard.tsx**

When `variant === 'dashboard'` and `preview.counts.existingPlayerCount > 0`, before calling `commitImport`, show:

```tsx
{showReimportConfirm && (
  <div className="bg-yellow-950 border border-yellow-700 rounded p-4 my-4">
    <p>This club already has {preview.counts.existingPlayerCount} players. Import will add {preview.counts.newPlayers} more. No duplicate detection.</p>
    <div className="mt-3 flex gap-3">
      <button onClick={() => setShowReimportConfirm(false)}>Cancel</button>
      <button onClick={handleConfirm}>Continue anyway</button>
    </div>
  </div>
)}
```

- [ ] **Step 3: Build + commit**

```bash
cd app-next && npm run build
git add app-next/app/dashboard/roster-import/import-wizard.tsx app-next/app/dashboard/roster-import/actions.ts app-next/app/dashboard/roster-import/lib/types.ts
git commit -m "feat(roster-import): re-import yellow-confirm for populated clubs"
```

---

## Task 12: Phase 2 ship

- [ ] **Step 1: Build + lint + push + deploy**

```bash
cd app-next && npm run build && npm run lint
cd .. && git push origin main && vercel --prod --yes
```

- [ ] **Step 2: Production smoke**

As an existing DOC (use a non-empty test account), navigate to `/dashboard/roster-import` from Settings, upload a CSV that adds new players to an existing team. Verify on dashboard.

**Phase 2 ship criteria met. Move to Phase 3.**

---

# PHASE 3 — Bulk parent invite send

**Phase 3 ships when:** The success screen has a "Send invites to N parents" button that bulk-emails all pending invites via Resend, shows progress, and displays per-email failures.

## Task 13: sendParentRecoveryEmails server action

**Files:**
- Modify: `app-next/app/dashboard/roster-import/actions.ts` (append `sendParentRecoveryEmails`)

Existing tools to reuse:
- `lib/email.ts` — Resend wrapper. Identify the canonical export.
- `service.auth.admin.generateLink({ type: 'recovery', email })` — Supabase admin API.

- [ ] **Step 1: Find the email helper**

```bash
grep -rln "from '@/lib/email'" app-next/app/ | head -5
cat app-next/lib/email.ts | head -40
```

Identify the function that sends a transactional email (likely `sendEmail` or similar). Note the signature.

- [ ] **Step 2: Implement sendParentRecoveryEmails**

```typescript
// Append to actions.ts

export async function sendParentRecoveryEmails(
  parentUserIds: string[]
): Promise<{ ok: true; data: { sent: number; failed: number; failures: { email: string; reason: string }[] } } | ActionFailure> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id, role')
    .eq('user_id', user.id)
    .single()
  if (!profile?.club_id || profile.role !== 'doc') {
    return { ok: false, error: 'DOC role required' }
  }

  // Verify these parent profiles all belong to the DOC's club (security)
  const { data: parentProfiles, error: profilesErr } = await supabase
    .from('profiles')
    .select('user_id, display_name')
    .eq('club_id', profile.club_id)
    .eq('role', 'parent')
    .in('user_id', parentUserIds)
  if (profilesErr) return { ok: false, error: profilesErr.message }

  const allowed = new Set(parentProfiles?.map(p => p.user_id) ?? [])
  const filteredIds = parentUserIds.filter(id => allowed.has(id))

  // Get the club name for the email body
  const { data: club } = await supabase
    .from('clubs')
    .select('name')
    .eq('id', profile.club_id)
    .single()
  const clubName = club?.name ?? 'your club'

  const service = createServiceClient()
  const failures: { email: string; reason: string }[] = []
  let sent = 0

  for (const userId of filteredIds) {
    try {
      // Look up the email for this user
      const { data: authUser, error: authErr } = await service.auth.admin.getUserById(userId)
      if (authErr || !authUser.user?.email) throw new Error('User lookup failed')
      const email = authUser.user.email

      // Generate a recovery link
      const { data: linkData, error: linkErr } = await service.auth.admin.generateLink({
        type: 'recovery',
        email,
      })
      if (linkErr || !linkData?.properties?.action_link) throw new Error('Link generation failed')
      const recoveryUrl = linkData.properties.action_link

      // Send via Resend
      await sendEmail({
        to: email,
        subject: `${clubName} added you on OffPitchOS — set your password`,
        html: `
          <p>Hi,</p>
          <p>${clubName} just added you to OffPitchOS — the team management app for your kids' soccer club.</p>
          <p><a href="${recoveryUrl}">Click here to set your password and log in</a>.</p>
          <p>You'll see your kid's schedule, get notifications when practice changes, and message coaches directly.</p>
          <p>— OffPitchOS</p>
        `,
      })
      sent++
    } catch (e: any) {
      const { data: authUser } = await service.auth.admin.getUserById(userId)
      failures.push({
        email: authUser?.user?.email ?? userId,
        reason: e.message ?? 'send failed',
      })
    }
  }

  return { ok: true, data: { sent, failed: failures.length, failures } }
}
```

Replace `sendEmail` with the actual canonical export from `@/lib/email`.

- [ ] **Step 3: Build + commit**

```bash
cd app-next && npm run build
git add app-next/app/dashboard/roster-import/actions.ts
git commit -m "feat(roster-import): sendParentRecoveryEmails — Supabase recovery links via Resend"
```

---

## Task 14: Success screen "Send invites" button + UI

**Files:**
- Modify: `app-next/app/dashboard/roster-import/import-wizard.tsx`

After commit, the success screen needs:
1. The "Send invites to N parents" button — uses `success.parentUserIds` (already on `CommitResult` from Task 5).
2. In-flight progress indicator.
3. Failure list with retry button.

- [ ] **Step 1: Wire the button + state in import-wizard.tsx**

```tsx
import { sendParentRecoveryEmails } from './actions'

const [inviting, setInviting] = useState(false)
const [inviteResult, setInviteResult] = useState<{ sent: number; failed: number; failures: any[] } | null>(null)

async function handleSendInvites() {
  if (!success?.parentUserIds?.length) return
  setInviting(true)
  const res = await sendParentRecoveryEmails(success.parentUserIds)
  setInviting(false)
  if (res.ok) setInviteResult(res.data)
  else setError(res.error)
}

// in success render:
{!inviteResult ? (
  <button onClick={handleSendInvites} disabled={inviting} className="bg-emerald-600 px-4 py-2 rounded">
    {inviting ? 'Sending…' : `Send invites to ${success.parentsCreated} parents`}
  </button>
) : (
  <div className="bg-zinc-900 rounded p-4">
    <p>Sent {inviteResult.sent}. {inviteResult.failed > 0 && `${inviteResult.failed} failed:`}</p>
    {inviteResult.failures.map((f, i) => (
      <p key={i} className="text-red-400 text-sm">{f.email} — {f.reason}</p>
    ))}
    {inviteResult.failed > 0 && (
      <button onClick={handleSendInvites} className="mt-3 text-emerald-400 underline">Retry failed</button>
    )}
  </div>
)}
```

- [ ] **Step 2: Build + manual smoke**

```bash
cd app-next && npm run build && npm run dev
```

Run the full flow with a CSV containing 1 real test email (e.g., your own). Click "Send invites." Confirm:
- The email arrives (subject: "[Club] added you on OffPitchOS — set your password").
- Clicking the link goes to a Supabase password-reset page.
- After setting password + signing in, the parent lands on the dashboard with their kid(s) already attached.

- [ ] **Step 3: Commit**

```bash
git add app-next/app/dashboard/roster-import/import-wizard.tsx
git commit -m "feat(roster-import): success screen — bulk send recovery emails + retry failed"
```

---

## Task 15: Phase 3 ship

- [ ] **Step 1: Build + lint + push + deploy**

```bash
cd app-next && npm run build && npm run lint
cd .. && git push origin main && vercel --prod --yes
```

- [ ] **Step 2: Production smoke (full migration story)**

Sign up with a fresh email → step 3 → upload CSV with one of your own emails as a parent → confirm import → click "Send invites" → click the invite email → sign up as parent → land on dashboard → see the player attributed correctly.

- [ ] **Step 3: Update outreach state memory**

Mark SE-import as fully shipped in `project_offpitchos_outreach_state.md`. Update the cold-email reply playbook in `2026-05-04-cold-email-sequence.md` so the "we already use SportsEngine" reply now points to a real `/dashboard/roster-import` flow instead of vapor.

- [ ] **Step 4: Final commit + PR description prep**

If still on a branch, squash to one PR. Otherwise main is already updated.

**Phase 3 ship criteria met. SE-import is live.**

---

## Post-ship verification checklist

- [ ] CSV with 100+ players imports in < 10s wall-clock
- [ ] Bulk invite send completes in < 30s for 100 parents
- [ ] Empty-state guard correctly blocks onboarding-path import on a populated club
- [ ] Re-import dashboard path shows the yellow dialog
- [ ] Sibling case: ONE auth.user + ONE profile per unique email; multiple players link to it; ONE recovery email
- [ ] After parent clicks recovery link + sets password, they sign in and see all their player(s) immediately
- [ ] Bad CSV (header row missing, garbage data) shows a clear error
- [ ] Mapping unmapped → required-field block at preview gate
- [ ] Re-clicking "Send invites" generates a fresh recovery link each time (Supabase invalidates the prior one) — never double-creates parents

## What's deliberately not built (v1)

Documented here so future-Jozo doesn't add them on a productive Tuesday:

- Undo / rollback
- CSV history / audit log
- Real-time progress bar
- Browser-refresh resumption
- Coaches / schedules / venues / attendance import
- CSV merge into existing players (any second import is additive only)
- Cross-club roster sharing
