import type { BoardObject, Field } from './object-schema'

export type FormationName =
  | '4-4-2'
  | '4-3-3'
  | '4-2-3-1'
  | '3-5-2'
  | '3-4-3'
  | '5-3-2'
  | '4-1-4-1'
  | 'diamond'

export const FORMATION_NAMES: FormationName[] = [
  '4-4-2', '4-3-3', '4-2-3-1', '3-5-2', '3-4-3', '5-3-2', '4-1-4-1', 'diamond',
]

interface PlayerTemplate {
  x_frac: number
  y_frac: number
  position: string
  role: 'gk' | 'red'
}

const FORMATIONS: Record<FormationName, PlayerTemplate[]> = {
  '4-4-2': [
    // GK
    { x_frac: 0.05, y_frac: 0.50, position: 'GK',  role: 'gk' },
    // Back four
    { x_frac: 0.20, y_frac: 0.15, position: 'LB',  role: 'red' },
    { x_frac: 0.20, y_frac: 0.38, position: 'CB',  role: 'red' },
    { x_frac: 0.20, y_frac: 0.62, position: 'CB',  role: 'red' },
    { x_frac: 0.20, y_frac: 0.85, position: 'RB',  role: 'red' },
    // Flat midfield four
    { x_frac: 0.45, y_frac: 0.15, position: 'LM',  role: 'red' },
    { x_frac: 0.45, y_frac: 0.38, position: 'CM',  role: 'red' },
    { x_frac: 0.45, y_frac: 0.62, position: 'CM',  role: 'red' },
    { x_frac: 0.45, y_frac: 0.85, position: 'RM',  role: 'red' },
    // Two strikers
    { x_frac: 0.78, y_frac: 0.38, position: 'ST',  role: 'red' },
    { x_frac: 0.78, y_frac: 0.62, position: 'ST',  role: 'red' },
  ],

  '4-3-3': [
    { x_frac: 0.05, y_frac: 0.50, position: 'GK',  role: 'gk' },
    { x_frac: 0.20, y_frac: 0.15, position: 'LB',  role: 'red' },
    { x_frac: 0.20, y_frac: 0.38, position: 'CB',  role: 'red' },
    { x_frac: 0.20, y_frac: 0.62, position: 'CB',  role: 'red' },
    { x_frac: 0.20, y_frac: 0.85, position: 'RB',  role: 'red' },
    // Three midfielders
    { x_frac: 0.45, y_frac: 0.25, position: 'CM',  role: 'red' },
    { x_frac: 0.45, y_frac: 0.50, position: 'CM',  role: 'red' },
    { x_frac: 0.45, y_frac: 0.75, position: 'CM',  role: 'red' },
    // Three forwards
    { x_frac: 0.78, y_frac: 0.18, position: 'LW',  role: 'red' },
    { x_frac: 0.78, y_frac: 0.50, position: 'ST',  role: 'red' },
    { x_frac: 0.78, y_frac: 0.82, position: 'RW',  role: 'red' },
  ],

  '4-2-3-1': [
    { x_frac: 0.05, y_frac: 0.50, position: 'GK',  role: 'gk' },
    { x_frac: 0.20, y_frac: 0.15, position: 'LB',  role: 'red' },
    { x_frac: 0.20, y_frac: 0.38, position: 'CB',  role: 'red' },
    { x_frac: 0.20, y_frac: 0.62, position: 'CB',  role: 'red' },
    { x_frac: 0.20, y_frac: 0.85, position: 'RB',  role: 'red' },
    // Double pivot DMs
    { x_frac: 0.38, y_frac: 0.35, position: 'DM',  role: 'red' },
    { x_frac: 0.38, y_frac: 0.65, position: 'DM',  role: 'red' },
    // Attacking three
    { x_frac: 0.58, y_frac: 0.20, position: 'LW',  role: 'red' },
    { x_frac: 0.58, y_frac: 0.50, position: 'CAM', role: 'red' },
    { x_frac: 0.58, y_frac: 0.80, position: 'RW',  role: 'red' },
    // Striker
    { x_frac: 0.80, y_frac: 0.50, position: 'ST',  role: 'red' },
  ],

  '3-5-2': [
    { x_frac: 0.05, y_frac: 0.50, position: 'GK',  role: 'gk' },
    // Three CBs
    { x_frac: 0.18, y_frac: 0.25, position: 'CB',  role: 'red' },
    { x_frac: 0.18, y_frac: 0.50, position: 'CB',  role: 'red' },
    { x_frac: 0.18, y_frac: 0.75, position: 'CB',  role: 'red' },
    // Two wing-backs pushed higher
    { x_frac: 0.42, y_frac: 0.10, position: 'LWB', role: 'red' },
    { x_frac: 0.42, y_frac: 0.90, position: 'RWB', role: 'red' },
    // Three central mids
    { x_frac: 0.48, y_frac: 0.30, position: 'CM',  role: 'red' },
    { x_frac: 0.48, y_frac: 0.50, position: 'CM',  role: 'red' },
    { x_frac: 0.48, y_frac: 0.70, position: 'CM',  role: 'red' },
    // Two strikers
    { x_frac: 0.78, y_frac: 0.38, position: 'ST',  role: 'red' },
    { x_frac: 0.78, y_frac: 0.62, position: 'ST',  role: 'red' },
  ],

  '3-4-3': [
    { x_frac: 0.05, y_frac: 0.50, position: 'GK',  role: 'gk' },
    // Three CBs
    { x_frac: 0.18, y_frac: 0.20, position: 'CB',  role: 'red' },
    { x_frac: 0.18, y_frac: 0.50, position: 'CB',  role: 'red' },
    { x_frac: 0.18, y_frac: 0.80, position: 'CB',  role: 'red' },
    // Flat midfield four
    { x_frac: 0.45, y_frac: 0.15, position: 'LM',  role: 'red' },
    { x_frac: 0.45, y_frac: 0.38, position: 'CM',  role: 'red' },
    { x_frac: 0.45, y_frac: 0.62, position: 'CM',  role: 'red' },
    { x_frac: 0.45, y_frac: 0.85, position: 'RM',  role: 'red' },
    // Three forwards
    { x_frac: 0.78, y_frac: 0.18, position: 'LW',  role: 'red' },
    { x_frac: 0.78, y_frac: 0.50, position: 'ST',  role: 'red' },
    { x_frac: 0.78, y_frac: 0.82, position: 'RW',  role: 'red' },
  ],

  '5-3-2': [
    { x_frac: 0.05, y_frac: 0.50, position: 'GK',  role: 'gk' },
    // Five across the back
    { x_frac: 0.17, y_frac: 0.10, position: 'LB',  role: 'red' },
    { x_frac: 0.17, y_frac: 0.30, position: 'CB',  role: 'red' },
    { x_frac: 0.17, y_frac: 0.50, position: 'CB',  role: 'red' },
    { x_frac: 0.17, y_frac: 0.70, position: 'CB',  role: 'red' },
    { x_frac: 0.17, y_frac: 0.90, position: 'RB',  role: 'red' },
    // Three midfielders
    { x_frac: 0.48, y_frac: 0.25, position: 'CM',  role: 'red' },
    { x_frac: 0.48, y_frac: 0.50, position: 'CM',  role: 'red' },
    { x_frac: 0.48, y_frac: 0.75, position: 'CM',  role: 'red' },
    // Two strikers
    { x_frac: 0.78, y_frac: 0.38, position: 'ST',  role: 'red' },
    { x_frac: 0.78, y_frac: 0.62, position: 'ST',  role: 'red' },
  ],

  '4-1-4-1': [
    { x_frac: 0.05, y_frac: 0.50, position: 'GK',  role: 'gk' },
    { x_frac: 0.20, y_frac: 0.15, position: 'LB',  role: 'red' },
    { x_frac: 0.20, y_frac: 0.38, position: 'CB',  role: 'red' },
    { x_frac: 0.20, y_frac: 0.62, position: 'CB',  role: 'red' },
    { x_frac: 0.20, y_frac: 0.85, position: 'RB',  role: 'red' },
    // Single CDM
    { x_frac: 0.35, y_frac: 0.50, position: 'CDM', role: 'red' },
    // Four midfielders
    { x_frac: 0.52, y_frac: 0.15, position: 'LM',  role: 'red' },
    { x_frac: 0.52, y_frac: 0.38, position: 'CM',  role: 'red' },
    { x_frac: 0.52, y_frac: 0.62, position: 'CM',  role: 'red' },
    { x_frac: 0.52, y_frac: 0.85, position: 'RM',  role: 'red' },
    // Single striker
    { x_frac: 0.82, y_frac: 0.50, position: 'ST',  role: 'red' },
  ],

  'diamond': [
    { x_frac: 0.05, y_frac: 0.50, position: 'GK',  role: 'gk' },
    { x_frac: 0.20, y_frac: 0.15, position: 'LB',  role: 'red' },
    { x_frac: 0.20, y_frac: 0.38, position: 'CB',  role: 'red' },
    { x_frac: 0.20, y_frac: 0.62, position: 'CB',  role: 'red' },
    { x_frac: 0.20, y_frac: 0.85, position: 'RB',  role: 'red' },
    // CDM — bottom of diamond
    { x_frac: 0.35, y_frac: 0.50, position: 'CDM', role: 'red' },
    // Wide CMs — sides of diamond
    { x_frac: 0.48, y_frac: 0.22, position: 'CM',  role: 'red' },
    { x_frac: 0.48, y_frac: 0.78, position: 'CM',  role: 'red' },
    // CAM — top of diamond
    { x_frac: 0.60, y_frac: 0.50, position: 'CAM', role: 'red' },
    // Two strikers
    { x_frac: 0.78, y_frac: 0.38, position: 'ST',  role: 'red' },
    { x_frac: 0.78, y_frac: 0.62, position: 'ST',  role: 'red' },
  ],
}

/**
 * Generate 11 BoardObject players for the given formation and field dimensions.
 * x runs from 0 (own goal line) to field.length_m (opponent goal line).
 * y runs from 0 (one sideline) to field.width_m (other sideline).
 */
export function generateFormation(name: FormationName, field: Field): BoardObject[] {
  const templates = FORMATIONS[name]
  // Normalize template x-fractions to [0, 1] so the formation fills the full
  // length of the playable area regardless of how the template was designed.
  // Then map to the visible range:
  //   full-field  → [PAD, 1-PAD] of length_m (attacking team goes left → right)
  //   half-field  → [0.5+PAD, 1-PAD] of length_m, flipped so GK is at the drawn
  //                 goal (x near length_m) and the attackers sit near the
  //                 centre line (x near length_m/2).
  const PAD = 0.04
  const xFracs = templates.map(t => t.x_frac)
  const minX = Math.min(...xFracs)
  const maxX = Math.max(...xFracs)
  const span = maxX - minX || 1
  return templates.map(t => {
    const norm = (t.x_frac - minX) / span  // 0 at own GK → 1 at strikers
    let xFrac: number
    if (field.half_field) {
      // Flip + map into the visible attacking half
      const low = 0.5 + PAD
      const high = 1 - PAD
      xFrac = high - norm * (high - low)
    } else {
      // Full pitch: GK near left goal, strikers near right goal
      xFrac = PAD + norm * (1 - 2 * PAD)
    }
    return {
      id: crypto.randomUUID(),
      type: 'player' as const,
      x: xFrac * field.length_m,
      y: t.y_frac * field.width_m,
      role: t.role,
      position: t.position,
    }
  })
}
