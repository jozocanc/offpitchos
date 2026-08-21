/**
 * Matching an export row to a player on the roster.
 *
 * This is the part that actually breaks in practice. A vest export spells
 * names its own way: "Orduña" vs "Orduna", "Mikkelsen, Alfred" vs "Alfred
 * Mikkelsen", nicknames, and initials. Getting it wrong silently attaches one
 * player's session to another, which is worse than not importing, so anything
 * below an unambiguous match is handed back for a human to resolve rather than
 * guessed at.
 */

export interface RosterPlayer {
  id: string
  firstName: string
  lastName: string
  jerseyNumber: number | null
}

export type MatchReason = 'jersey' | 'full-name' | 'last-name-initial'

export interface RowMatch {
  playerId: string | null
  reason: MatchReason | null
  /** True when more than one player fit equally well, so neither was chosen. */
  ambiguous: boolean
}

/** Lowercase, strip accents and punctuation, collapse whitespace. */
export function normalizeName(raw: string): string {
  return (raw ?? '')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** "Mikkelsen, Alfred" -> "alfred mikkelsen". Leaves other formats alone. */
function unswapComma(raw: string): string {
  const parts = raw.split(',')
  if (parts.length === 2 && parts[0].trim() && parts[1].trim()) {
    return `${parts[1].trim()} ${parts[0].trim()}`
  }
  return raw
}

export function matchRow(
  fields: { name?: string; firstName?: string; lastName?: string; jersey?: string },
  roster: RosterPlayer[]
): RowMatch {
  // 1. Jersey number. Only trusted when exactly one player wears it — a roster
  //    with duplicates (common mid-season) must not silently pick one.
  const jerseyRaw = (fields.jersey ?? '').replace(/[^0-9]/g, '')
  if (jerseyRaw !== '') {
    const n = Number(jerseyRaw)
    const hits = roster.filter(p => p.jerseyNumber === n)
    if (hits.length === 1) return { playerId: hits[0].id, reason: 'jersey', ambiguous: false }
    if (hits.length > 1) return { playerId: null, reason: null, ambiguous: true }
  }

  // 2. Full name, however the export spelled it.
  const candidate = fields.name
    ? normalizeName(unswapComma(fields.name))
    : normalizeName(`${fields.firstName ?? ''} ${fields.lastName ?? ''}`)

  if (!candidate) return { playerId: null, reason: null, ambiguous: false }

  const full = roster.filter(p => normalizeName(`${p.firstName} ${p.lastName}`) === candidate)
  if (full.length === 1) return { playerId: full[0].id, reason: 'full-name', ambiguous: false }
  if (full.length > 1) return { playerId: null, reason: null, ambiguous: true }

  // 3. Last name plus first initial, which covers "A. Mikkelsen" and nicknames
  //    where the surname still lines up.
  const tokens = candidate.split(' ')
  if (tokens.length >= 2) {
    const initial = tokens[0][0]
    const surname = tokens[tokens.length - 1]
    const partial = roster.filter(
      p =>
        normalizeName(p.lastName) === surname &&
        normalizeName(p.firstName).startsWith(initial)
    )
    if (partial.length === 1) {
      return { playerId: partial[0].id, reason: 'last-name-initial', ambiguous: false }
    }
    if (partial.length > 1) return { playerId: null, reason: null, ambiguous: true }
  }

  return { playerId: null, reason: null, ambiguous: false }
}
