// The schedule reader's tool schema, prompt and matching helpers.

import { isoToWallDate, isoToWallTime } from '@/lib/format-datetime'
import { SCHEDULE_FIELDS, SCHEDULE_TYPES, type ScheduleDraftRow, type ScheduleField, type ScheduleType } from './types'

const nullableString = { type: ['string', 'null'] as const }

export const SCHEDULE_TOOL = {
  name: 'record_schedule',
  description: 'Record every game, tournament match, practice and team meeting listed in the schedule file.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['events'],
    properties: {
      events: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['date', 'time', 'type', 'opponent', 'home_away', 'location', 'uncertain_fields'],
          properties: {
            date: { type: 'string', description: 'YYYY-MM-DD.' },
            time: { ...nullableString, description: 'Start time as HH:MM in 24-hour local time. Null if TBA/TBD or not listed.' },
            type: { type: 'string', enum: [...SCHEDULE_TYPES] },
            opponent: {
              type: 'string',
              description: 'Game: the opponent only, without "vs", "at" or "@". Otherwise the event name, e.g. "Region XIV Semifinal" or "Team meeting".',
            },
            home_away: { type: 'string', enum: ['home', 'away', 'neutral', 'unknown'] },
            location: { ...nullableString, description: 'Venue, field or city as printed.' },
            uncertain_fields: {
              type: 'array',
              items: { type: 'string', enum: [...SCHEDULE_FIELDS] },
              description: 'Fields you could not read with confidence. Empty if all clear.',
            },
          },
        },
      },
    },
  },
}

export const SCHEDULE_SYSTEM_PROMPT = `You read soccer team schedules for a coaching staff: athletics-website pages and screenshots, PDFs, spreadsheets, Word documents, typed lists and phone photos. Record every event with the record_schedule tool.

Rules:
- One entry per event. Skip results-only summaries, standings, headers and other teams' games.
- "vs", "home" or a home venue means home_away "home"; "at" or "@" means "away"; a neutral site or "N" means "neutral". "unknown" if the file doesn't say.
- Conference, region and national tournament matches are type "tournament", with the round as the opponent field when no opponent is known yet (e.g. "Region XIV Quarterfinal").
- Dates: when the year isn't printed, use the season year you are given; a fall season that runs into the new year continues into the next year.
- Times: convert to 24-hour HH:MM exactly as printed (local time). "TBA", "TBD" or no time means null. Never invent a time.
- Ignore scores and results; record the event itself.
- If a value is hard to read, give your best reading and list that field in uncertain_fields. Staff check flagged fields before saving.
- Always answer by calling record_schedule exactly once.`

export function str(v: unknown, max = 120): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : ''
}

export interface ExistingEvent {
  id: string
  type: string
  title: string
  start_time: string
  /** Address, else the venue name. */
  place: string
}

/** Duration by type when the file has no end time. Matches how games were set up. */
export function defaultMinutes(type: ScheduleType): number {
  return type === 'game' ? 110 : type === 'meeting' ? 60 : 120
}

/** "vs Blinn College" / "at Coastal Bend College" / "Region XIV Final". */
export function eventTitle(r: Pick<ScheduleDraftRow, 'type' | 'opponent' | 'home_away' | 'time'>): string {
  const name = r.opponent.trim()
  let title: string
  if (r.type === 'game') title = `${r.home_away === 'away' ? 'at' : 'vs'} ${name}`
  else title = name || (r.type === 'practice' ? 'Practice' : r.type === 'meeting' ? 'Team meeting' : 'Tournament')
  return r.time ? title : `${title} (time TBD)`
}

function norm(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/\(time tbd\)/g, '').replace(/^(vs\.?|at|@)\s+/, '').replace(/[^a-z0-9]/g, '')
}

const GAMEY = new Set(['game', 'tournament'])

/** Existing event on the same day: same opponent, else the only one of that kind. */
export function findEventMatch(row: ScheduleDraftRow, events: ExistingEvent[], used: Set<string>, timeZone: string) {
  const sameDay = events.filter(e => !used.has(e.id) && isoToWallDate(e.start_time, timeZone) === row.date)
  const kind = (t: string) => (GAMEY.has(t) ? 'game' : t)
  const sameKind = sameDay.filter(e => kind(e.type) === kind(row.type))
  const byName = sameKind.filter(e => norm(e.title) === norm(row.opponent))
  if (byName.length === 1) return byName[0]
  if (sameKind.length === 1) return sameKind[0]
  return null
}

export function eventChanges(row: ScheduleDraftRow, e: ExistingEvent, timeZone: string): ScheduleField[] {
  const out: ScheduleField[] = []
  if (row.time && row.time !== isoToWallTime(e.start_time, timeZone)) out.push('time')
  if (norm(eventTitle(row)) !== norm(e.title) || /\(time tbd\)/i.test(e.title) !== !row.time) out.push('opponent')
  if (row.location && norm(row.location) !== norm(e.place)) out.push('location')
  return out
}

export function eventLabel(e: ExistingEvent, timeZone: string): string {
  return `${e.title} · ${isoToWallTime(e.start_time, timeZone)}`
}

export function isScheduleType(v: unknown): v is ScheduleType {
  return typeof v === 'string' && (SCHEDULE_TYPES as readonly string[]).includes(v)
}
