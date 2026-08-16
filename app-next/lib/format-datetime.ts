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

/** Whole days between two dayKey() values. Negative means `key` is in the past. */
export function daysFromToday(key: string, timeZone: string): number {
  const at = (k: string) => new Date(`${k}T00:00:00Z`).getTime()
  return Math.round((at(key) - at(dayKey(new Date(), timeZone))) / 86_400_000)
}
