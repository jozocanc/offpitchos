// CSV for spreadsheet downloads (roster and schedule export).
//
// A UTF-8 byte order mark makes Excel read accented names (Tomás) correctly.
// Cells starting with = + - @ are prefixed with ' so a spreadsheet never runs
// them as formulas: player notes and titles are typed by users.

export type CsvCell = string | number | boolean | null | undefined

function cell(value: CsvCell): string {
  if (value === null || value === undefined) return ''
  let s = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv(header: string[], rows: CsvCell[][]): string {
  return '﻿' + [header, ...rows].map(r => r.map(cell).join(',')).join('\r\n') + '\r\n'
}

export function csvResponse(csv: string, filename: string): Response {
  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  })
}

export function fileSlug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'team'
}
