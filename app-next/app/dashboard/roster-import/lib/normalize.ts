// app-next/app/dashboard/roster-import/lib/normalize.ts

export function normalizeEmail(raw: string): string | null {
  const v = raw?.trim().toLowerCase() ?? ''
  if (!v) return null
  // Loose check — proper validation happens at preview-warning time
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return null
  return v
}

export function isValidEmail(raw: string): boolean {
  return normalizeEmail(raw) !== null
}

export function normalizePhone(raw: string): string {
  const digits = (raw ?? '').replace(/\D/g, '')
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`
  }
  return raw?.trim() ?? ''
}

// Try ISO, US (M/D/YYYY), UK (D/M/YYYY). Returns ISO date string or null.
// If ambiguous (both US and UK could parse to different dates), returns null + ambiguous=true.
export function normalizeDate(raw: string): { iso: string | null; ambiguous: boolean } {
  const v = (raw ?? '').trim()
  if (!v) return { iso: null, ambiguous: false }

  // ISO YYYY-MM-DD
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v)
  if (iso) {
    const [, y, m, d] = iso
    if (isValidYMD(+y, +m, +d)) return { iso: `${y}-${m}-${d}`, ambiguous: false }
  }

  // Slash-separated M/D/YYYY or D/M/YYYY
  const slash = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(v)
  if (slash) {
    const [, a, b, y] = slash
    const usValid = isValidYMD(+y, +a, +b)
    const ukValid = isValidYMD(+y, +b, +a)
    if (usValid && ukValid && a !== b) return { iso: null, ambiguous: true }
    if (usValid) return { iso: pad(+y, +a, +b), ambiguous: false }
    if (ukValid) return { iso: pad(+y, +b, +a), ambiguous: false }
  }

  return { iso: null, ambiguous: false }
}

function isValidYMD(y: number, m: number, d: number): boolean {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return false
  const dt = new Date(Date.UTC(y, m - 1, d))
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
}

function pad(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function trimName(raw: string): string {
  return (raw ?? '').trim()
}

// Lowercase + collapse whitespace for case-insensitive team-name matching.
export function teamKey(name: string): string {
  return (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}
