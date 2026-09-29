// Team invite codes: the short code a head coach shares with the whole squad
// (/join/code/XXXX). Nothing generated one before; FAU's was set by hand, so
// every team created in the app had no way to invite its players by code.

// No 0/O, 1/I/L: codes get read out loud and typed on phones.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

/** e.g. "Tyler Junior College Men's Soccer" -> "TJC" + 3 random chars. */
export function makeTeamCode(programName?: string | null): string {
  const initials = (programName ?? '')
    .split(/\s+/)
    .map(w => w.replace(/[^A-Za-z]/g, '').charAt(0).toUpperCase())
    .filter(c => c && ALPHABET.includes(c))
    .slice(0, 3)
    .join('')
  let rand = ''
  for (let i = 0; i < 6 - initials.length; i++) {
    rand += ALPHABET[Math.floor(Math.random() * ALPHABET.length)]
  }
  return `${initials}${rand}`.slice(0, 6).padEnd(6, 'X')
}
