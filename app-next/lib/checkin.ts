/**
 * Daily player check-in: shared types and rules, safe to import from server
 * and client code alike (no server-only imports here).
 *
 * Scales: sleep and energy are 1 = poor/low, 5 = great/high. Soreness is
 * inverted: 1 = fresh, 5 = very sore. Table: public.player_checkins (054).
 */

export const CHECKIN_STATUSES = ['fit', 'limited', 'out'] as const
export type CheckinStatus = (typeof CHECKIN_STATUSES)[number]

export const CHECKIN_STATUS_LABELS: Record<CheckinStatus, string> = {
  fit: 'Fit',
  limited: 'Limited',
  out: 'Out',
}

export const CHECKIN_NOTE_MAX = 280

/** How many days back the Readiness board's date switcher goes. */
export const READINESS_LOOKBACK_DAYS = 13

export interface CheckinValues {
  sleep: number
  soreness: number
  energy: number
  status: CheckinStatus
  note: string | null
}

export interface CheckinRow extends CheckinValues {
  id: string
  playerId: string
  checkinDate: string
  updatedAt: string
}

export function isCheckinStatus(v: unknown): v is CheckinStatus {
  return typeof v === 'string' && (CHECKIN_STATUSES as readonly string[]).includes(v)
}

export function isScaleValue(v: unknown): v is number {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 5
}

/**
 * A check-in staff should look at: the player is out, very sore, slept badly
 * or has no energy. Returns the reasons (empty = not flagged).
 */
export function checkinFlags(c: Pick<CheckinValues, 'status' | 'sleep' | 'soreness' | 'energy'>): string[] {
  const reasons: string[] = []
  if (c.status === 'out') reasons.push('Out')
  if (c.soreness >= 4) reasons.push(`Soreness ${c.soreness}`)
  if (c.sleep <= 2) reasons.push(`Sleep ${c.sleep}`)
  if (c.energy <= 2) reasons.push(`Energy ${c.energy}`)
  return reasons
}

export function isFlagged(c: Pick<CheckinValues, 'status' | 'sleep' | 'soreness' | 'energy'>): boolean {
  return checkinFlags(c).length > 0
}
