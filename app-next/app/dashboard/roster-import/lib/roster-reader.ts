// The roster reader's tool schema and prompt (used by file-actions.ts).

import { ROSTER_FIELDS, type RosterDraftRow, type RosterField } from './file-types'

const nullableString = { type: ['string', 'null'] as const }

export const ROSTER_TOOL = {
  name: 'record_roster',
  description: 'Record every player listed on the roster file. Players only: skip coaches, staff, managers and trainers.',
  input_schema: {
    type: 'object',
    additionalProperties: false,
    required: ['players'],
    properties: {
      players: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['first_name', 'last_name', 'jersey_number', 'position', 'date_of_birth', 'class_year', 'height', 'hometown', 'uncertain_fields'],
          properties: {
            first_name: { type: 'string' },
            last_name: { type: 'string', description: 'Family name, including particles like "Van" or "De".' },
            jersey_number: { ...nullableString, description: 'Exactly as printed, e.g. "7", "00". Null if none.' },
            position: { ...nullableString, description: 'As printed, e.g. "GK", "D", "MF", "F", "Defender".' },
            date_of_birth: { ...nullableString, description: 'YYYY-MM-DD only when a full date is printed, else null.' },
            class_year: { ...nullableString, description: 'e.g. "Fr", "So", "Jr", "Sr", "R-Fr".' },
            height: nullableString,
            hometown: { ...nullableString, description: 'Hometown and/or previous school as printed.' },
            uncertain_fields: {
              type: 'array',
              items: { type: 'string', enum: [...ROSTER_FIELDS] },
              description: 'Fields you could not read with confidence. Empty if all clear.',
            },
          },
        },
      },
    },
  },
}

export const ROSTER_SYSTEM_PROMPT = `You read soccer team rosters for a coaching staff: athletics-website pages and screenshots, PDFs, spreadsheets, Word documents, typed lists and phone photos of printed or handwritten sheets. Record every player with the record_roster tool.

Rules:
- One entry per player. Skip coaches, staff, managers, trainers and totals or header rows.
- Split names into first and last. "Diaz, Juan" means first "Juan", last "Diaz". Keep accents and capitalization as printed. Fix all-caps names to normal capitalization ("JUAN DIAZ" becomes "Juan Diaz").
- Copy jersey numbers exactly as printed; never invent one.
- Never guess a value that isn't in the file: use null.
- If a name, number or position is hard to read, give your best reading and list that field in uncertain_fields. Staff check flagged fields before saving.
- Always answer by calling record_roster exactly once.`

export function str(v: unknown, max = 80): string {
  return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : ''
}

export interface ExistingPlayer {
  id: string
  first_name: string
  last_name: string
  jersey_number: number | null
  position: string | null
  date_of_birth: string | null
}

export function normName(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '')
}

export function jerseyText(v: string): string {
  const digits = v.replace(/\D/g, '').slice(0, 3)
  return digits ? String(parseInt(digits, 10)) : ''
}

/** Existing player for a row: same full name, else same last name + number. */
export function findMatch(row: { first_name: string; last_name: string; jersey_number: string }, players: ExistingPlayer[], used: Set<string>) {
  const free = players.filter(p => !used.has(p.id))
  const full = normName(row.first_name + row.last_name)
  const byName = free.filter(p => normName(p.first_name + p.last_name) === full)
  if (byName.length === 1) return byName[0]
  const last = normName(row.last_name)
  const jersey = jerseyText(row.jersey_number)
  if (jersey) {
    const byLastAndNumber = free.filter(p => normName(p.last_name) === last && String(p.jersey_number ?? '') === jersey)
    if (byLastAndNumber.length === 1) return byLastAndNumber[0]
  }
  return null
}

export function changedFields(row: RosterDraftRow, p: ExistingPlayer): RosterField[] {
  const out: RosterField[] = []
  const jersey = jerseyText(row.jersey_number)
  if (jersey && jersey !== String(p.jersey_number ?? '')) out.push('jersey_number')
  if (row.position && row.position.toLowerCase() !== (p.position ?? '').toLowerCase()) out.push('position')
  if (row.date_of_birth && row.date_of_birth !== (p.date_of_birth ?? '')) out.push('date_of_birth')
  return out
}

export function playerLabel(p: ExistingPlayer): string {
  return `${p.jersey_number != null ? `#${p.jersey_number} ` : ''}${p.first_name} ${p.last_name}`
}
