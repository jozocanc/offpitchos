/**
 * Column handling for GPS vest exports.
 *
 * Written vendor-agnostically on purpose. Titan (Hudl), WIMU, Catapult,
 * STATSports and Polar all export the same handful of ideas under different
 * headers and different units, and a club that switches vendor should not lose
 * the feature. Same shape as the roster importer's se-column-aliases.
 */

export const GPS_FIELDS = [
  'duration_min',
  'distance_m',
  'high_speed_distance_m',
  'sprints',
  'top_speed_kmh',
  'accelerations',
  'decelerations',
  'player_load',
] as const

export type GpsField = (typeof GPS_FIELDS)[number]

/** Identity columns: how we find which player a row belongs to. */
export const ID_FIELDS = ['player_name', 'player_first_name', 'player_last_name', 'jersey_number'] as const
export type IdField = (typeof ID_FIELDS)[number]

export type MappedField = GpsField | IdField

export const FIELD_LABELS: Record<MappedField, string> = {
  player_name: 'Player name',
  player_first_name: 'First name',
  player_last_name: 'Last name',
  jersey_number: 'Jersey number',
  duration_min: 'Duration (min)',
  distance_m: 'Total distance (m)',
  high_speed_distance_m: 'High-speed distance (m)',
  sprints: 'Sprints',
  top_speed_kmh: 'Top speed (km/h)',
  accelerations: 'Accelerations',
  decelerations: 'Decelerations',
  player_load: 'Player load',
}

/** Lowercased header → field. Compared case-insensitively, punctuation stripped. */
const ALIASES: Record<string, MappedField> = {
  // identity
  'player': 'player_name',
  'player name': 'player_name',
  'athlete': 'player_name',
  'athlete name': 'player_name',
  'name': 'player_name',
  'full name': 'player_name',
  'first name': 'player_first_name',
  'firstname': 'player_first_name',
  'last name': 'player_last_name',
  'lastname': 'player_last_name',
  'surname': 'player_last_name',
  'number': 'jersey_number',
  'no': 'jersey_number',
  'jersey': 'jersey_number',
  'jersey number': 'jersey_number',
  'shirt number': 'jersey_number',
  'squad number': 'jersey_number',

  // duration
  'duration': 'duration_min',
  'time': 'duration_min',
  'minutes': 'duration_min',
  'mins': 'duration_min',
  'session time': 'duration_min',
  'time on pitch': 'duration_min',
  'minutes played': 'duration_min',

  // distance
  'distance': 'distance_m',
  'total distance': 'distance_m',
  'dist': 'distance_m',
  'distance covered': 'distance_m',
  'total dist': 'distance_m',

  'high speed distance': 'high_speed_distance_m',
  'hsr': 'high_speed_distance_m',
  'high speed running': 'high_speed_distance_m',
  'hi speed distance': 'high_speed_distance_m',
  'sprint distance': 'high_speed_distance_m',

  // counts
  'sprints': 'sprints',
  'sprint count': 'sprints',
  'no of sprints': 'sprints',
  'number of sprints': 'sprints',

  'accelerations': 'accelerations',
  'accels': 'accelerations',
  'acc': 'accelerations',
  'accel count': 'accelerations',
  'decelerations': 'decelerations',
  'decels': 'decelerations',
  'dec': 'decelerations',
  'decel count': 'decelerations',

  // speed + load
  'top speed': 'top_speed_kmh',
  'max speed': 'top_speed_kmh',
  'peak speed': 'top_speed_kmh',
  'max velocity': 'top_speed_kmh',
  'top velocity': 'top_speed_kmh',

  'player load': 'player_load',
  'load': 'player_load',
  'total load': 'player_load',
  'training load': 'player_load',
}

/** "Total Distance (m)" -> "total distance". Units are read separately. */
function baseName(header: string): string {
  return header
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')   // drop unit parentheticals
    .replace(/\[[^\]]*\]/g, ' ')
    // "#" is the most common jersey header there is, and stripping punctuation
    // would leave it empty. Spell it out before that happens.
    .replace(/#/g, ' number ')
    .replace(/[^a-z0-9\s]/g, ' ') // punctuation to space
    .replace(/\s+/g, ' ')
    .trim()
}

export function suggestMapping(headers: string[]): Record<string, MappedField | ''> {
  const mapping: Record<string, MappedField | ''> = {}
  const taken = new Set<MappedField>()

  for (const header of headers) {
    const guess = ALIASES[baseName(header)]
    // First header to claim a field wins; a second "distance" column is left
    // unmapped for the human rather than silently overwriting the first.
    if (guess && !taken.has(guess)) {
      mapping[header] = guess
      taken.add(guess)
    } else {
      mapping[header] = ''
    }
  }

  return mapping
}

/**
 * Convert a cell to the unit the column stores, using whatever the header
 * admits about its own units. Vendors disagree: distance comes in m, km or
 * yards, speed in km/h, m/s or mph, duration in minutes or seconds.
 */
export function coerce(field: GpsField, rawValue: string, header: string): number | null {
  const cleaned = (rawValue ?? '').replace(/[^0-9.\-]/g, '')
  if (cleaned === '' || cleaned === '-' || cleaned === '.') return null

  const n = Number(cleaned)
  if (!Number.isFinite(n)) return null

  const h = header.toLowerCase()

  if (field === 'distance_m' || field === 'high_speed_distance_m') {
    if (/\bkm\b|kilomet/.test(h)) return round(n * 1000)
    if (/\byd\b|yard/.test(h)) return round(n * 0.9144)
    if (/\bmi\b|\bmile/.test(h)) return round(n * 1609.344)
    return round(n)
  }

  if (field === 'top_speed_kmh') {
    if (/mph|mi\/h/.test(h)) return round(n * 1.609344)
    if (/m\/s|ms-1|metres per second/.test(h)) return round(n * 3.6)
    return round(n)
  }

  if (field === 'duration_min') {
    if (/\bsec|\bs\b/.test(h)) return round(n / 60)
    if (/\bhour|\bhr|\bh\b/.test(h)) return round(n * 60)
    return round(n)
  }

  // Counts are integers.
  if (field === 'sprints' || field === 'accelerations' || field === 'decelerations') {
    return Math.round(n)
  }

  return round(n)
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}
