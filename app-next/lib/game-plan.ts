/**
 * Game plan (059): formations, lineup + set-piece shapes, and the pure rules
 * the builder runs on (formation switch, auto-fill, corner templates).
 *
 * Safe for server and client: no server-only imports.
 *
 * Coordinates
 *   Lineup:   x, y in 0..1 on a PORTRAIT full pitch, our goal at the bottom
 *             (y = 1), the opponent's goal at the top.
 *   Corners:  x, y in 0..1 on a half-pitch BOX VIEW: the goal line along the
 *             top (y = 0), the view reaching BOX_VIEW.depthM metres out. The
 *             left corner flag is (0, 0), the right one (1, 0).
 *
 * Players are referenced by id only. Names and numbers come from the roster
 * at render time, which is what keeps the plan in sync when a number or a
 * name is corrected.
 */

import { z } from 'zod'

// ─── Formations ──────────────────────────────────────────────────────────────

export const FORMATIONS = [
  '4-4-2', '4-3-3', '4-2-3-1', '4-1-4-1', '4-4-1-1', '3-5-2', '3-4-3', '5-3-2', '5-4-1',
] as const
export type Formation = (typeof FORMATIONS)[number]
export const DEFAULT_FORMATION: Formation = '4-3-3'

export function isFormation(v: unknown): v is Formation {
  return typeof v === 'string' && (FORMATIONS as readonly string[]).includes(v)
}

type PresetSlot = readonly [label: string, x: number, y: number]

const GK: PresetSlot = ['GK', 0.5, 0.92]
const BACK4: PresetSlot[] = [['LB', 0.12, 0.74], ['LCB', 0.37, 0.79], ['RCB', 0.63, 0.79], ['RB', 0.88, 0.74]]
const BACK3: PresetSlot[] = [['LCB', 0.24, 0.78], ['CB', 0.5, 0.8], ['RCB', 0.76, 0.78]]
const BACK5: PresetSlot[] = [['LWB', 0.08, 0.68], ['LCB', 0.3, 0.78], ['CB', 0.5, 0.8], ['RCB', 0.7, 0.78], ['RWB', 0.92, 0.68]]
const MID4: PresetSlot[] = [['LM', 0.12, 0.5], ['LCM', 0.37, 0.54], ['RCM', 0.63, 0.54], ['RM', 0.88, 0.5]]
const STRIKERS2: PresetSlot[] = [['LS', 0.37, 0.22], ['RS', 0.63, 0.22]]

const PRESETS: Record<Formation, PresetSlot[]> = {
  '4-4-2': [GK, ...BACK4, ...MID4, ...STRIKERS2],
  '4-3-3': [GK, ...BACK4, ['DM', 0.5, 0.62], ['LCM', 0.3, 0.5], ['RCM', 0.7, 0.5], ['LW', 0.15, 0.24], ['ST', 0.5, 0.18], ['RW', 0.85, 0.24]],
  '4-2-3-1': [GK, ...BACK4, ['LDM', 0.37, 0.61], ['RDM', 0.63, 0.61], ['LW', 0.14, 0.38], ['CAM', 0.5, 0.4], ['RW', 0.86, 0.38], ['ST', 0.5, 0.18]],
  '4-1-4-1': [GK, ...BACK4, ['DM', 0.5, 0.64], ['LM', 0.12, 0.46], ['LCM', 0.37, 0.48], ['RCM', 0.63, 0.48], ['RM', 0.88, 0.46], ['ST', 0.5, 0.2]],
  '4-4-1-1': [GK, ...BACK4, ...MID4, ['SS', 0.5, 0.35], ['ST', 0.5, 0.17]],
  '3-5-2': [GK, ...BACK3, ['LWB', 0.08, 0.52], ['LCM', 0.32, 0.54], ['DM', 0.5, 0.62], ['RCM', 0.68, 0.54], ['RWB', 0.92, 0.52], ...STRIKERS2],
  '3-4-3': [GK, ...BACK3, ['LM', 0.1, 0.5], ['LCM', 0.37, 0.55], ['RCM', 0.63, 0.55], ['RM', 0.9, 0.5], ['LW', 0.18, 0.25], ['ST', 0.5, 0.19], ['RW', 0.82, 0.25]],
  '5-3-2': [GK, ...BACK5, ['LCM', 0.28, 0.5], ['CM', 0.5, 0.55], ['RCM', 0.72, 0.5], ...STRIKERS2],
  '5-4-1': [GK, ...BACK5, ['LM', 0.12, 0.47], ['LCM', 0.37, 0.52], ['RCM', 0.63, 0.52], ['RM', 0.88, 0.47], ['ST', 0.5, 0.2]],
}

// ─── Lines and roles ─────────────────────────────────────────────────────────

export type Line = 'GK' | 'D' | 'M' | 'F'

/** Role family: what a slot does, ignoring side. */
type Family = 'GK' | 'CB' | 'FB' | 'WB' | 'DM' | 'CM' | 'WM' | 'AM' | 'W' | 'ST'

const FAMILY: Record<string, Family> = {
  GK: 'GK',
  CB: 'CB', LCB: 'CB', RCB: 'CB',
  LB: 'FB', RB: 'FB',
  LWB: 'WB', RWB: 'WB',
  DM: 'DM', LDM: 'DM', RDM: 'DM',
  CM: 'CM', LCM: 'CM', RCM: 'CM',
  LM: 'WM', RM: 'WM',
  CAM: 'AM', AM: 'AM', LAM: 'AM', RAM: 'AM',
  LW: 'W', RW: 'W',
  ST: 'ST', LS: 'ST', RS: 'ST', CF: 'ST', SS: 'ST',
}

const FAMILY_LINE: Record<Family, Line> = {
  GK: 'GK', CB: 'D', FB: 'D', WB: 'D', DM: 'M', CM: 'M', WM: 'M', AM: 'M', W: 'F', ST: 'F',
}

// Families that can stand in for each other when a formation changes.
const NEIGHBOURS: [Family, Family][] = [
  ['FB', 'WB'], ['WB', 'WM'], ['WM', 'W'], ['DM', 'CM'], ['CM', 'AM'], ['AM', 'ST'], ['W', 'ST'], ['CB', 'DM'],
]

function familyOf(label: string): Family | null {
  return FAMILY[label.toUpperCase()] ?? null
}

function sideOf(label: string): 'L' | 'C' | 'R' {
  const l = label.toUpperCase()
  if (l === 'LB' || l.startsWith('LC') || l.startsWith('LW') || l.startsWith('LD') || l === 'LM' || l === 'LS' || l === 'LAM') return 'L'
  if (l === 'RB' || l.startsWith('RC') || l.startsWith('RW') || l.startsWith('RD') || l === 'RM' || l === 'RS' || l === 'RAM') return 'R'
  return 'C'
}

/** The line a slot plays in (GK / D / M / F). Unknown labels count as M. */
export function slotLine(label: string): Line {
  const f = familyOf(label)
  return f ? FAMILY_LINE[f] : 'M'
}

/** Lines whose players fit a slot. Wing-backs take a defender or a midfielder. */
export function slotAccepts(label: string): Line[] {
  const f = familyOf(label)
  if (f === 'WB') return ['D', 'M']
  return [slotLine(label)]
}

/**
 * Line from a roster position, which is free text ("GK", "Goalkeeper", "CB",
 * "Defender", "MF", "Winger", "FW"...). Null when nothing recognisable.
 */
export function positionLine(position: string | null | undefined): Line | null {
  if (!position) return null
  const p = position.trim().toUpperCase()
  if (!p) return null
  if (p === 'G' || p === 'GK' || p.includes('GOAL') || p.includes('KEEP')) return 'GK'
  const fam = familyOf(p.split(/[\s/,-]+/)[0])
  if (fam) return FAMILY_LINE[fam]
  if (p === 'D' || p === 'DF' || p === 'DEF' || p.includes('DEFEN') || p.includes('BACK')) return 'D'
  if (p === 'M' || p === 'MF' || p === 'MID' || p.includes('MIDF')) return 'M'
  if (p === 'F' || p === 'FW' || p === 'FWD' || p.includes('FORW') || p.includes('STRIK') || p.includes('WING') || p.includes('ATTACK')) return 'F'
  return null
}

// ─── Shapes (zod for the server, types for everyone) ────────────────────────

const unit = z.number().min(0).max(1)
const shortId = z.string().min(1).max(40)

export const LineupSlotSchema = z.object({
  slot_id: shortId,
  label: z.string().min(1).max(6),
  x: unit,
  y: unit,
  player_id: z.uuid().nullable(),
})
export type LineupSlot = z.infer<typeof LineupSlotSchema>

export const MAX_BENCH = 23

export const LineupSchema = z.object({
  slots: z.array(LineupSlotSchema).max(11),
  bench: z.array(z.uuid()).max(MAX_BENCH),
  captain_id: z.uuid().nullable(),
})
export type Lineup = z.infer<typeof LineupSchema>

export const SetPieceMarkerSchema = z.object({
  id: shortId,
  player_id: z.uuid().nullable(),
  /** Follows whoever stands in this lineup slot while player_id is null. */
  slot_id: shortId.nullable().optional(),
  x: unit,
  y: unit,
  role_label: z.string().max(24),
})
export type SetPieceMarker = z.infer<typeof SetPieceMarkerSchema>

export const SetPieceArrowSchema = z.object({
  id: shortId,
  x1: unit, y1: unit, x2: unit, y2: unit,
})
export type SetPieceArrow = z.infer<typeof SetPieceArrowSchema>

export const SETUPS = ['zonal', 'man', 'mixed'] as const
export type Setup = (typeof SETUPS)[number]
export const SETUP_LABELS: Record<Setup, string> = { zonal: 'Zonal', man: 'Man to man', mixed: 'Mixed' }

export const SetPieceSchema = z.object({
  setup: z.enum(SETUPS).nullable(),
  markers: z.array(SetPieceMarkerSchema).max(16),
  arrows: z.array(SetPieceArrowSchema).max(30),
  notes: z.string().max(1000),
})
export type SetPiece = z.infer<typeof SetPieceSchema>

export const SET_PIECE_KEYS = ['corner_attack_left', 'corner_attack_right', 'corner_defend'] as const
export type SetPieceKey = (typeof SET_PIECE_KEYS)[number]
export const SET_PIECE_LABELS: Record<SetPieceKey, string> = {
  corner_attack_left: 'Corners: attacking left',
  corner_attack_right: 'Corners: attacking right',
  corner_defend: 'Corners: defending',
}

export const SetPiecesSchema = z.object({
  corner_attack_left: SetPieceSchema.nullable(),
  corner_attack_right: SetPieceSchema.nullable(),
  corner_defend: SetPieceSchema.nullable(),
})
export type SetPieces = z.infer<typeof SetPiecesSchema>

export const MAX_PLAN_DRILLS = 20
export const MAX_PLAN_NOTES = 4000

/** Everything the builder autosaves (sharing is its own action). */
export const GamePlanDocSchema = z.object({
  formation: z.enum(FORMATIONS),
  lineup: LineupSchema,
  set_pieces: SetPiecesSchema,
  drill_ids: z.array(z.uuid()).max(MAX_PLAN_DRILLS),
  notes: z.string().max(MAX_PLAN_NOTES),
})
export type GamePlanDoc = z.infer<typeof GamePlanDocSchema>

// ─── Building and reading ───────────────────────────────────────────────────

export function presetSlots(formation: Formation): LineupSlot[] {
  return PRESETS[formation].map(([label, x, y]) => ({ slot_id: label, label, x, y, player_id: null }))
}

export function emptySetPieces(): SetPieces {
  return { corner_attack_left: null, corner_attack_right: null, corner_defend: null }
}

export function emptyPlanDoc(formation: Formation = DEFAULT_FORMATION): GamePlanDoc {
  return {
    formation,
    lineup: { slots: presetSlots(formation), bench: [], captain_id: null },
    set_pieces: emptySetPieces(),
    drill_ids: [],
    notes: '',
  }
}

/**
 * Read a stored row into a valid doc. Anything malformed falls back to the
 * empty shape for that part instead of failing the page.
 */
export function normalizePlanDoc(row: {
  formation?: unknown
  lineup?: unknown
  set_pieces?: unknown
  drill_ids?: unknown
  notes?: unknown
} | null | undefined): GamePlanDoc {
  const formation = isFormation(row?.formation) ? row.formation : DEFAULT_FORMATION
  const base = emptyPlanDoc(formation)
  if (!row) return base

  const lineup = LineupSchema.safeParse(row.lineup)
  const sp = row.set_pieces && typeof row.set_pieces === 'object' ? row.set_pieces as Record<string, unknown> : {}
  const set_pieces = emptySetPieces()
  for (const k of SET_PIECE_KEYS) {
    const parsed = SetPieceSchema.safeParse(sp[k])
    set_pieces[k] = parsed.success ? parsed.data : null
  }
  const drills = z.array(z.uuid()).safeParse(row.drill_ids)

  return {
    formation,
    lineup: lineup.success && lineup.data.slots.length === 11 ? lineup.data : base.lineup,
    set_pieces,
    drill_ids: drills.success ? drills.data.slice(0, MAX_PLAN_DRILLS) : [],
    notes: typeof row.notes === 'string' ? row.notes.slice(0, MAX_PLAN_NOTES) : '',
  }
}

export function placedCount(lineup: Lineup): number {
  return lineup.slots.filter(s => s.player_id).length
}

/** The player a marker shows: its own pick, else whoever is in its slot. */
export function markerPlayerId(marker: SetPieceMarker, slots: LineupSlot[]): string | null {
  if (marker.player_id) return marker.player_id
  if (!marker.slot_id) return null
  return slots.find(s => s.slot_id === marker.slot_id)?.player_id ?? null
}

/** Remove a player from the XI and bench (before placing them elsewhere). */
export function withoutPlayer(lineup: Lineup, playerId: string): Lineup {
  return {
    ...lineup,
    slots: lineup.slots.map(s => (s.player_id === playerId ? { ...s, player_id: null } : s)),
    bench: lineup.bench.filter(id => id !== playerId),
  }
}

/** Put a player in a slot, moving them out of any other slot or the bench. */
export function assignSlot(lineup: Lineup, slotId: string, playerId: string | null): Lineup {
  const base = playerId ? withoutPlayer(lineup, playerId) : lineup
  return { ...base, slots: base.slots.map(s => (s.slot_id === slotId ? { ...s, player_id: playerId } : s)) }
}

// ─── Formation change ───────────────────────────────────────────────────────

function pairScore(from: string, to: string): number {
  if (from === to) return 10
  const fa = familyOf(from)
  const fb = familyOf(to)
  if (!fa || !fb) return slotLine(from) === slotLine(to) ? 1 : 0
  if (fa === 'GK' || fb === 'GK') return fa === fb ? 10 : 0
  const sameSide = sideOf(from) === sideOf(to)
  if (fa === fb) return sameSide ? 6 : 5
  if (NEIGHBOURS.some(([a, b]) => (a === fa && b === fb) || (a === fb && b === fa))) return sameSide ? 4 : 3
  if (FAMILY_LINE[fa] === FAMILY_LINE[fb]) return sameSide ? 2 : 1.5
  return 0
}

/**
 * Switch formation, keeping assigned players where possible: best role match
 * first (same label, same role, neighbouring role, same line, preferring the
 * same side), then the rest in order. A goalkeeper only moves to GK and an
 * outfielder never lands in goal. Bench and captain are untouched.
 *
 * Also returns old slot id -> new slot id for each moved player, so corner
 * markers that follow a slot can follow the player to their new slot.
 */
export function changeFormation(lineup: Lineup, formation: Formation): { lineup: Lineup; slotMap: Record<string, string> } {
  const next = presetSlots(formation)
  const placed = lineup.slots.filter(s => s.player_id)
  const slotMap: Record<string, string> = {}

  const pairs: { from: LineupSlot; to: number; score: number; order: number }[] = []
  placed.forEach((from, fi) => {
    next.forEach((to, ti) => {
      const score = pairScore(from.label, to.label)
      if (score > 0) pairs.push({ from, to: ti, score, order: fi * 100 + ti })
    })
  })
  pairs.sort((a, b) => b.score - a.score || a.order - b.order)

  const usedFrom = new Set<string>()
  const usedTo = new Set<number>()
  for (const p of pairs) {
    if (usedFrom.has(p.from.slot_id) || usedTo.has(p.to)) continue
    usedFrom.add(p.from.slot_id)
    usedTo.add(p.to)
    next[p.to].player_id = p.from.player_id
    slotMap[p.from.slot_id] = next[p.to].slot_id
  }

  // Anyone left: next free outfield slot in order (never into goal).
  for (const from of placed) {
    if (usedFrom.has(from.slot_id)) continue
    const ti = next.findIndex((s, i) => !usedTo.has(i) && slotLine(s.label) !== 'GK')
    if (ti === -1) continue
    usedFrom.add(from.slot_id)
    usedTo.add(ti)
    next[ti].player_id = from.player_id
    slotMap[from.slot_id] = next[ti].slot_id
  }

  return { lineup: { ...lineup, slots: next }, slotMap }
}

/**
 * After a formation change, point slot-linked corner markers at the slot their
 * player moved to. A marker whose slot vanished and whose player was not
 * placed keeps showing that player by pinning player_id.
 */
export function remapSetPieceSlots(
  setPieces: SetPieces,
  oldSlots: LineupSlot[],
  newSlots: LineupSlot[],
  slotMap: Record<string, string>,
): SetPieces {
  const newIds = new Set(newSlots.map(s => s.slot_id))
  const out = emptySetPieces()
  for (const k of SET_PIECE_KEYS) {
    const sp = setPieces[k]
    if (!sp) continue
    out[k] = {
      ...sp,
      markers: sp.markers.map(m => {
        if (m.player_id || !m.slot_id) return m
        const mapped = slotMap[m.slot_id]
        if (mapped) return { ...m, slot_id: mapped }
        if (newIds.has(m.slot_id) && !oldSlots.find(s => s.slot_id === m.slot_id)?.player_id) return m
        const was = oldSlots.find(s => s.slot_id === m.slot_id)?.player_id ?? null
        return { ...m, slot_id: null, player_id: was }
      }),
    }
  }
  return out
}

// ─── Availability and auto-fill ─────────────────────────────────────────────

export type Availability = 'available' | 'limited' | 'out' | 'unknown'

export const AVAILABILITY_LABELS: Record<Availability, string> = {
  available: 'Available',
  limited: 'Limited',
  out: 'Out',
  unknown: 'Unknown',
}

export const AVAILABILITY_RANK: Record<Availability, number> = { available: 0, limited: 1, unknown: 2, out: 3 }

export interface PlanPlayer {
  id: string
  firstName: string
  lastName: string
  jerseyNumber: number | null
  position: string | null
  /** Staff only; players' read-only view gets 'unknown'. */
  availability: Availability
}

const LINE_ORDER: Line[] = ['GK', 'D', 'M', 'F']

/**
 * Fill EMPTY slots. Available players whose position fits the slot's line
 * first, then other available players (an outfielder never goes in goal and a
 * keeper never goes outfield). If slots are still empty, the same two passes
 * run over players with no check-in or RSVP yet. Limited and Out players are
 * never auto-picked. Picked bench players leave the bench.
 */
export function autoFillLineup(lineup: Lineup, players: PlanPlayer[]): { lineup: Lineup; filled: number } {
  const taken = new Set(lineup.slots.map(s => s.player_id).filter(Boolean) as string[])
  const slots = lineup.slots.map(s => ({ ...s }))
  const order = slots
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => !s.player_id)
    .sort((a, b) => LINE_ORDER.indexOf(slotLine(a.s.label)) - LINE_ORDER.indexOf(slotLine(b.s.label)) || a.i - b.i)
  const byNumber = (a: PlanPlayer, b: PlanPlayer) =>
    (a.jerseyNumber ?? 999) - (b.jerseyNumber ?? 999) || a.lastName.localeCompare(b.lastName)

  let filled = 0
  for (const tier of ['available', 'unknown'] as Availability[]) {
    const pool = players.filter(p => p.availability === tier).sort(byNumber)
    for (const strict of [true, false]) {
      for (const { s } of order) {
        if (s.player_id) continue
        const line = slotLine(s.label)
        const accepts = slotAccepts(s.label)
        const pick = pool.find(p => {
          if (taken.has(p.id)) return false
          const pl = positionLine(p.position)
          if (strict) return pl !== null && accepts.includes(pl)
          if (line === 'GK') return pl === 'GK'
          return pl !== 'GK'
        })
        if (!pick) continue
        s.player_id = pick.id
        taken.add(pick.id)
        filled++
      }
    }
  }

  return {
    lineup: { ...lineup, slots, bench: lineup.bench.filter(id => !taken.has(id)) },
    filled,
  }
}

// ─── Corner templates ───────────────────────────────────────────────────────

/** The box view: full width, BOX_VIEW.depthM metres out from the goal line. */
export const BOX_VIEW = { widthM: 68, depthM: 36 } as const

type TemplateMarker = { label: string; x: number; y: number; prefer: string[] }

// Left corner (flag top-left). The right corner mirrors x.
const ATTACK_TEMPLATE: TemplateMarker[] = [
  { label: 'Taker', x: 0.03, y: 0.04, prefer: ['LW', 'LM', 'CAM', 'LAM', 'LCM', 'RW', 'RM', 'CM'] },
  { label: 'Near post', x: 0.41, y: 0.11, prefer: ['ST', 'LS', 'CF', 'RS', 'SS'] },
  { label: 'Far post', x: 0.62, y: 0.13, prefer: ['RCB', 'CB', 'LCB'] },
  { label: 'Penalty spot', x: 0.5, y: 0.3, prefer: ['LCB', 'CB', 'RCB', 'RS', 'ST'] },
  { label: 'GK screen', x: 0.53, y: 0.04, prefer: ['RS', 'SS', 'ST', 'RW', 'CAM'] },
  { label: 'Edge of box', x: 0.48, y: 0.52, prefer: ['CAM', 'LCM', 'RCM', 'CM', 'RW', 'RM'] },
  { label: 'Short option', x: 0.14, y: 0.07, prefer: ['LB', 'LWB', 'LM', 'LCM', 'LW'] },
  { label: 'Rest defense', x: 0.35, y: 0.88, prefer: ['DM', 'LDM', 'RDM', 'CM', 'RCM'] },
  { label: 'Rest defense', x: 0.65, y: 0.88, prefer: ['RB', 'RWB', 'RDM', 'CB', 'RCB'] },
]

const DEFEND_TEMPLATE: TemplateMarker[] = [
  { label: 'GK', x: 0.5, y: 0.05, prefer: ['GK'] },
  { label: 'Near post', x: 0.39, y: 0.03, prefer: ['LB', 'LWB', 'LM'] },
  { label: 'Far post', x: 0.61, y: 0.03, prefer: ['RB', 'RWB', 'RM'] },
  { label: 'Zone near', x: 0.38, y: 0.17, prefer: ['LCB', 'CB', 'RCB'] },
  { label: 'Zone middle', x: 0.5, y: 0.19, prefer: ['CB', 'RCB', 'LCB', 'ST'] },
  { label: 'Zone far', x: 0.62, y: 0.17, prefer: ['RCB', 'ST', 'LS', 'RS', 'CB'] },
  { label: 'Man marker', x: 0.36, y: 0.33, prefer: ['DM', 'LDM', 'RDM', 'LCM'] },
  { label: 'Man marker', x: 0.5, y: 0.36, prefer: ['RDM', 'LCM', 'RCM', 'CM', 'RS'] },
  { label: 'Man marker', x: 0.64, y: 0.33, prefer: ['RCM', 'CM', 'CAM', 'LS', 'SS'] },
  { label: 'Short corner', x: 0.13, y: 0.06, prefer: ['LW', 'LM', 'LCM', 'LWB'] },
  { label: 'Edge of box', x: 0.5, y: 0.52, prefer: ['RW', 'RM', 'CAM', 'SS', 'ST'] },
]

function mirrorLabel(label: string): string {
  if (label.startsWith('L')) return 'R' + label.slice(1)
  if (label.startsWith('R')) return 'L' + label.slice(1)
  return label
}

/**
 * Corner template linked to the lineup: each marker follows the lineup slot
 * that fits its job best (CBs and strikers in the box, a winger taking or
 * short, a midfielder and a full back in rest defense). With an empty
 * formation slot the marker still links to the slot, so it fills in once the
 * coach picks a player. Markers never link to the same slot twice.
 */
export function cornerTemplate(key: SetPieceKey, slots: LineupSlot[]): SetPiece {
  const right = key === 'corner_attack_right'
  const tpl = key === 'corner_defend' ? DEFEND_TEMPLATE : ATTACK_TEMPLATE
  const used = new Set<string>()
  const outfield = slots.filter(s => slotLine(s.label) !== 'GK')

  const markers: SetPieceMarker[] = tpl.map((t, i) => {
    const prefer = right ? t.prefer.map(mirrorLabel) : t.prefer
    let slot: LineupSlot | undefined
    for (const label of prefer) {
      slot = slots.find(s => s.label === label && !used.has(s.slot_id))
      if (slot) break
    }
    if (!slot && t.label !== 'GK') slot = outfield.find(s => !used.has(s.slot_id))
    if (slot) used.add(slot.slot_id)
    return {
      id: `m${i + 1}`,
      player_id: null,
      slot_id: slot?.slot_id ?? null,
      x: right ? 1 - t.x : t.x,
      y: t.y,
      role_label: t.label,
    }
  })

  const flagX = right ? 0.98 : 0.02
  const arrows: SetPieceArrow[] = key === 'corner_defend'
    ? []
    : [{ id: 'a1', x1: flagX, y1: 0.02, x2: right ? 0.56 : 0.44, y2: 0.14 }]

  return {
    setup: key === 'corner_defend' ? 'mixed' : null,
    markers,
    arrows,
    notes: '',
  }
}

// ─── Print sections ─────────────────────────────────────────────────────────

export type PrintSection = 'lineup' | SetPieceKey | `drill:${string}`

export function parsePrintSections(raw: string | null | undefined): PrintSection[] | null {
  if (!raw) return null
  const out: PrintSection[] = []
  for (const part of raw.split(',')) {
    const s = part.trim()
    if (s === 'lineup' || (SET_PIECE_KEYS as readonly string[]).includes(s)) out.push(s as PrintSection)
    else if (/^drill:[0-9a-f-]{36}$/i.test(s)) out.push(s as PrintSection)
  }
  return out
}

// ─── Display helpers ────────────────────────────────────────────────────────

export function playerShortName(p: Pick<PlanPlayer, 'firstName' | 'lastName'>): string {
  return (p.lastName || p.firstName || '').trim()
}

export function playerFullName(p: Pick<PlanPlayer, 'firstName' | 'lastName'>): string {
  return `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim()
}
