/**
 * Renders a team as "Name (Age group)", or just "Name" when the age group is
 * blank.
 *
 * Not every team has a meaningful age group. A college program, a senior men's
 * side or a club's first team is just its name — labelling one "Senior" is
 * noise at best, and in a US college context it reads as a fourth-year student,
 * which is actively wrong on a team page. Teams like that carry an empty
 * age_group (the column is NOT NULL, so blank rather than null) and every
 * display goes through here.
 */
export function teamLabel(name: string, ageGroup?: string | null): string {
  const group = (ageGroup ?? '').trim()
  return group ? `${name} (${group})` : name
}

/** The age group on its own, or null when there is nothing worth showing. */
export function ageGroupLabel(ageGroup?: string | null): string | null {
  const group = (ageGroup ?? '').trim()
  return group || null
}
