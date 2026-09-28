/**
 * Timezone-aware date formatting.
 *
 * Every formatter here REQUIRES a timeZone. That is the whole point of the
 * module: `toLocaleTimeString` without one resolves against the runtime's
 * zone, which is UTC in Vercel's Node runtime and the user's real zone in the
 * browser. Server-rendered HTML and the hydrated client then disagree, React
 * throws error #418, and the user reads a wrong time until hydration lands.
 *
 * Observed in production before this existed: a 6:00 PM practice rendered as
 * 10:00 PM on first paint of every /dashboard/schedule load.
 *
 * Get the zone from useClubTimezone() in client components, or pass
 * club.timezone directly in server components. Do not reach for
 * `new Date(...).toLocaleTimeString()` without a zone anywhere in the app.
 */

/** Matches the migration 043 column default and the pre-existing hardcoded call sites. */
export const DEFAULT_TIMEZONE = 'America/New_York'

type DateInput = Date | string | number

function toDate(value: DateInput): Date {
  return value instanceof Date ? value : new Date(value)
}

/** "6:00 PM" */
export function formatTime(value: DateInput, timeZone: string): string {
  return toDate(value).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone,
  })
}

/** "6:00 PM – 8:00 PM" */
export function formatTimeRange(start: DateInput, end: DateInput, timeZone: string): string {
  return `${formatTime(start, timeZone)} – ${formatTime(end, timeZone)}`
}

/** "Thursday, August 20" */
export function formatLongDate(value: DateInput, timeZone: string): string {
  return toDate(value).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone,
  })
}

/** "Thu, Aug 20" */
export function formatShortDate(value: DateInput, timeZone: string): string {
  return toDate(value).toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone,
  })
}

/** "Aug 20" */
export function formatMonthDay(value: DateInput, timeZone: string): string {
  return toDate(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone,
  })
}

/** "Aug 20, 2026" */
export function formatMonthDayYear(value: DateInput, timeZone: string): string {
  return toDate(value).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone,
  })
}

/** "Aug 20, 2026, 6:00 PM" */
export function formatDateTime(value: DateInput, timeZone: string): string {
  return toDate(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone,
  })
}

/**
 * The calendar day a timestamp falls on IN THE CLUB'S ZONE, as "YYYY-MM-DD".
 *
 * Use this for grouping events into day buckets. Grouping on the raw UTC date
 * puts an 8pm Eastern event on the following day, because 8pm EDT is 00:00 UTC
 * the next morning — the schedule would show it under the wrong heading.
 */
export function dayKey(value: DateInput, timeZone: string): string {
  // en-CA gives ISO-style YYYY-MM-DD ordering directly.
  return toDate(value).toLocaleDateString('en-CA', { timeZone })
}

/**
 * Render a "YYYY-MM-DD" key from dayKey() as "Thursday, August 20".
 *
 * Formatted as UTC deliberately: the key is ALREADY the calendar date in the
 * club's zone, so converting it again would shift it. Anchoring at UTC
 * midnight and formatting in UTC prints exactly those digits, identically on
 * the server and the client.
 */
export function formatDayKeyLong(key: string): string {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * Render a "YYYY-MM-DD" key as "Aug 20". UTC-anchored for the same reason as
 * formatDayKeyLong: the key is a calendar date, not an instant, so it must not
 * be shifted by any zone.
 *
 * Use this instead of `new Date(key + 'T00:00:00')`, which parses at LOCAL
 * midnight and therefore resolves differently on the server than in the
 * browser — the same class of mismatch migration 043 fixed for event times.
 */
export function formatDayKeyShort(key: string): string {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

/**
 * A timestamp broken into its calendar parts IN A GIVEN ZONE.
 *
 * Needed wherever code would otherwise reach for getHours() / getDate() /
 * getDay(), all of which resolve against the runtime's zone — UTC on the
 * server. A 22:00Z event has hour 22 on the server and hour 18 in an Eastern
 * browser, so anything positioning by hour renders in a different place on
 * each side.
 */
export function zonedParts(value: DateInput, timeZone: string): {
  key: string
  hour: number
  minute: number
} {
  const d = toDate(value)
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(d)

  const get = (t: string) => parts.find(p => p.type === t)?.value ?? '0'
  // hourCycle h23 still yields "24" at midnight in some engines; normalize.
  const hour = Number(get('hour')) % 24

  return {
    key: `${get('year')}-${get('month')}-${get('day')}`,
    hour,
    minute: Number(get('minute')),
  }
}

/** "Mon" for a "YYYY-MM-DD" key. UTC-anchored, so it never shifts. */
export function formatDayKeyWeekday(key: string): string {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'short',
    timeZone: 'UTC',
  })
}

/** Shift a "YYYY-MM-DD" key by whole days, staying in key space. */
export function addDaysToKey(key: string, days: number): string {
  const d = new Date(`${key}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/** The Monday of the week containing `key`, as a key. */
export function mondayOfKey(key: string): string {
  const d = new Date(`${key}T00:00:00Z`)
  const dow = d.getUTCDay() // 0 = Sunday
  return addDaysToKey(key, dow === 0 ? -6 : 1 - dow)
}

/** Whole days between two dayKey() values. Negative means `key` is in the past. */
export function daysFromToday(key: string, timeZone: string): number {
  const at = (k: string) => new Date(`${k}T00:00:00Z`).getTime()
  return Math.round((at(key) - at(dayKey(new Date(), timeZone))) / 86_400_000)
}

/**
 * The UTC ISO string for a wall-clock date + time in `timeZone`.
 * `new Date('YYYY-MM-DDTHH:MM')` reads the BROWSER's zone, so a coach creating
 * a 3:30 PM practice from another state stored it an hour off. Two passes
 * settle the offset across DST edges.
 */
export function wallTimeToIso(date: string, time: string, timeZone: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const [hh, mm] = time.split(':').map(Number)
  const target = Date.UTC(y, m - 1, d, hh, mm)
  let guess = target
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(new Date(guess), timeZone)
    const [py, pm, pd] = p.key.split('-').map(Number)
    guess += target - Date.UTC(py, pm - 1, pd, p.hour, p.minute)
  }
  return new Date(guess).toISOString()
}

/** "YYYY-MM-DDTHH:MM" (datetime-local value) in `timeZone` -> UTC ISO. */
export function wallDateTimeToIso(value: string, timeZone: string): string {
  const [date, time] = value.split('T')
  return wallTimeToIso(date, time ?? '00:00', timeZone)
}

/** ISO -> "YYYY-MM-DD" in `timeZone`, for <input type="date">. */
export function isoToWallDate(value: DateInput, timeZone: string): string {
  return zonedParts(value, timeZone).key
}

/** ISO -> "HH:MM" in `timeZone`, for <input type="time">. */
export function isoToWallTime(value: DateInput, timeZone: string): string {
  const p = zonedParts(value, timeZone)
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`
}

/** ISO -> "YYYY-MM-DDTHH:MM" in `timeZone`, for <input type="datetime-local">. */
export function isoToWallDateTime(value: DateInput | null | undefined, timeZone: string): string {
  if (!value) return ''
  const d = toDate(value)
  if (Number.isNaN(d.getTime())) return ''
  return `${isoToWallDate(d, timeZone)}T${isoToWallTime(d, timeZone)}`
}
