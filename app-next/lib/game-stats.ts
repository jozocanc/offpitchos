/**
 * Game report + player game stats (migration 057). Client-safe: types,
 * constants, roster matching and small formatters shared by the server
 * actions, the schedule modal and the player profile.
 */

export const STAT_KEYS = [
  'minutes',
  'goals',
  'assists',
  'shots',
  'shots_on_goal',
  'yellow_cards',
  'red_cards',
  'saves',
  'goals_against',
] as const
export type StatKey = (typeof STAT_KEYS)[number]

/** One player's line for one game, as saved. */
export interface GameStatInput {
  player_id: string
  started: boolean
  minutes: number | null
  goals: number
  assists: number
  shots: number
  shots_on_goal: number
  yellow_cards: number
  red_cards: number
  /** Goalkeepers only. */
  saves: number | null
  goals_against: number | null
}

/** One row read from the document by the AI (our side only). */
export interface ExtractedPlayerRow {
  jersey_number: number | null
  name: string
  started: boolean | null
  minutes: number | null
  goals: number | null
  assists: number | null
  shots: number | null
  shots_on_goal: number | null
  yellow_cards: number | null
  red_cards: number | null
  saves: number | null
  goals_against: number | null
  /** Fields the model could not read confidently (smudged, cut off, ambiguous). */
  uncertain_fields: string[]
}

/** Field names the model may flag as uncertain. */
export const EXTRACTED_FIELDS = [
  'jersey_number',
  'name',
  'started',
  ...STAT_KEYS,
] as const

export interface RosterPlayer {
  id: string
  first_name: string
  last_name: string
  jersey_number: number | null
  position: string | null
}

export type MatchConfidence = 'high' | 'medium' | 'low'

export interface MatchedRow {
  row: ExtractedPlayerRow
  player_id: string
  confidence: MatchConfidence
  /** How it matched, for the review UI ("#7 + name", "last name"...). */
  reason: string
}

export interface MatchResult {
  matched: MatchedRow[]
  unmatched: ExtractedPlayerRow[]
}

export const MAX_REPORT_BYTES = 10 * 1024 * 1024

export const SUPPORTED_TYPES_LABEL = 'PDF, JPG, PNG, WebP, CSV, Excel (.xlsx, .xls), Word (.docx) or TXT'

/** accept= for the file picker. */
export const REPORT_ACCEPT =
  '.pdf,.jpg,.jpeg,.png,.webp,.gif,.csv,.txt,.tsv,.xlsx,.xls,.docx,application/pdf,image/jpeg,image/png,image/webp,text/csv,text/plain,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export function isGoalkeeper(position: string | null | undefined): boolean {
  if (!position) return false
  const p = position.toLowerCase()
  return /\bgk\b/.test(p) || p.includes('goal') || p.includes('keeper')
}

/** "2-1 W", "1-1 D", "0-2 L"; null when either score is missing. */
export function formatResult(teamScore: number | null | undefined, opponentScore: number | null | undefined): string | null {
  if (teamScore == null || opponentScore == null) return null
  const r = teamScore > opponentScore ? 'W' : teamScore < opponentScore ? 'L' : 'D'
  return `${teamScore}-${opponentScore} ${r}`
}

/** Short push/summary line: "80 min, 1 goal, 1 assist". */
export function summarizeLine(s: Pick<GameStatInput, 'minutes' | 'goals' | 'assists' | 'saves'>): string {
  const parts: string[] = []
  if (s.minutes != null) parts.push(`${s.minutes} min`)
  if (s.goals > 0) parts.push(`${s.goals} goal${s.goals === 1 ? '' : 's'}`)
  if (s.assists > 0) parts.push(`${s.assists} assist${s.assists === 1 ? '' : 's'}`)
  if (s.saves != null && s.saves > 0) parts.push(`${s.saves} save${s.saves === 1 ? '' : 's'}`)
  return parts.join(', ')
}

// ---------------------------------------------------------------------------
// Roster matching
// ---------------------------------------------------------------------------

const SUFFIXES = new Set(['jr', 'sr', 'ii', 'iii', 'iv', 'v'])

/** Lowercase, strip accents and everything but letters: "SirLuke" and "Sirluke" -> "sirluke", "O'Brien" -> "obrien". */
export function normalizeName(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z]/g, '')
}

function tokens(s: string): string[] {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .split(/[\s.\-]+/)
    .map(t => t.replace(/[^a-z]/g, ''))
    .filter(t => t && !SUFFIXES.has(t))
}

/**
 * Split a box-score name into first/last. Handles "Smith, John",
 * "SMITH, J.", "John Smith", "J. Smith" and a single token ("SirLuke").
 */
function splitName(raw: string): { first: string; last: string; single: string | null } {
  const name = raw.replace(/^\s*#?\d+\s+/, '').replace(/\*/g, '').trim()
  if (name.includes(',')) {
    const [lastPart, firstPart = ''] = name.split(',', 2)
    return { first: tokens(firstPart).join(''), last: tokens(lastPart).join(''), single: null }
  }
  const t = tokens(name)
  if (t.length === 0) return { first: '', last: '', single: null }
  if (t.length === 1) return { first: '', last: '', single: t[0] }
  return { first: t[0], last: t[t.length - 1], single: null }
}

/** 0..1 how well an extracted name fits a roster player. */
function nameScore(raw: string, p: RosterPlayer): number {
  const { first, last, single } = splitName(raw)
  const pFirst = normalizeName(p.first_name)
  const pLast = normalizeName(p.last_name)
  const pFull = pFirst + pLast
  const all = normalizeName(raw.replace(/^\s*#?\d+\s+/, ''))
  if (!all) return 0

  if (all === pFull || all === pLast + pFirst) return 1
  if (single) {
    if (single === pFull) return 1
    if (single === pLast || single === pFirst) return 0.7
    return 0
  }
  // Multi-word last names ("De La Cruz") and middle names: compare the
  // concatenated forms too.
  const lastHit = last === pLast || (last.length >= 4 && pLast.endsWith(last)) || (pLast.length >= 4 && all.endsWith(pLast))
  if (!lastHit) {
    // "Firstname" alone written as two tokens is rare; nothing else counts.
    return 0
  }
  if (first && (first === pFirst || pFirst.startsWith(first) || first.startsWith(pFirst))) return 0.95
  if (first && first[0] === pFirst[0]) return 0.9
  if (!first) return 0.8
  // Last name matches but the first name clearly differs (brothers, common
  // surname): weak.
  return 0.6
}

/**
 * Match AI rows to our roster. Jersey number first, confirmed or overruled by
 * the name; then name alone. Each roster player is used at most once: when
 * two rows want the same player, the stronger one keeps it and the other is
 * returned unmatched for staff to assign.
 */
export function matchRowsToRoster(rows: ExtractedPlayerRow[], roster: RosterPlayer[]): MatchResult {
  type Candidate = { idx: number; player_id: string; score: number; confidence: MatchConfidence; reason: string }
  const candidates: (Candidate | null)[] = rows.map((row, idx) => {
    const byNumber = row.jersey_number != null
      ? roster.filter(p => p.jersey_number === row.jersey_number)
      : []
    const scored = roster
      .map(p => ({ p, s: row.name ? nameScore(row.name, p) : 0 }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s)
    const best = scored[0]
    // Ambiguous when two players tie on the best name score.
    const bestUnique = best && !(scored[1] && scored[1].s === best.s) ? best : null

    if (byNumber.length === 1) {
      const p = byNumber[0]
      const s = row.name ? nameScore(row.name, p) : 0
      if (s >= 0.6) return { idx, player_id: p.id, score: 2 + s, confidence: 'high', reason: `#${row.jersey_number} + name` }
      if (!row.name.trim()) return { idx, player_id: p.id, score: 1.5, confidence: 'medium', reason: `#${row.jersey_number}` }
      // Number points at one player, the name at another: trust a strong name.
      if (bestUnique && bestUnique.s >= 0.8 && bestUnique.p.id !== p.id) {
        return { idx, player_id: bestUnique.p.id, score: 1 + bestUnique.s, confidence: 'medium', reason: 'name (number differs)' }
      }
      return { idx, player_id: p.id, score: 1.4, confidence: 'medium', reason: `#${row.jersey_number} (name differs)` }
    }

    // Duplicate numbers on the roster: let the name pick between them.
    if (byNumber.length > 1) {
      const pick = byNumber
        .map(p => ({ p, s: row.name ? nameScore(row.name, p) : 0 }))
        .sort((a, b) => b.s - a.s)[0]
      if (pick && pick.s >= 0.6) return { idx, player_id: pick.p.id, score: 2 + pick.s, confidence: 'high', reason: `#${row.jersey_number} + name` }
    }

    if (bestUnique) {
      if (bestUnique.s >= 0.9) return { idx, player_id: bestUnique.p.id, score: 1 + bestUnique.s, confidence: 'high', reason: 'full name' }
      if (bestUnique.s >= 0.7) return { idx, player_id: bestUnique.p.id, score: 1 + bestUnique.s, confidence: 'medium', reason: 'last name' }
      return { idx, player_id: bestUnique.p.id, score: bestUnique.s, confidence: 'low', reason: 'partial name' }
    }
    return null
  })

  const taken = new Map<string, Candidate>()
  for (const c of candidates) {
    if (!c) continue
    const prev = taken.get(c.player_id)
    if (!prev || c.score > prev.score) taken.set(c.player_id, c)
  }
  const winners = new Set(Array.from(taken.values()).map(c => c.idx))

  const matched: MatchedRow[] = []
  const unmatched: ExtractedPlayerRow[] = []
  rows.forEach((row, idx) => {
    const c = candidates[idx]
    if (c && winners.has(idx)) {
      matched.push({ row, player_id: c.player_id, confidence: c.confidence, reason: c.reason })
    } else {
      unmatched.push(row)
    }
  })
  return { matched, unmatched }
}
