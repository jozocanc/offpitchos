export const DRILL_CATEGORIES = [
  'rondo','build-up','pressing','finishing','warm-up','ssg','transition','other',
] as const
export type DrillCategory = typeof DRILL_CATEGORIES[number]

export const DRILL_CATEGORY_LABELS: Record<DrillCategory, string> = {
  'rondo': 'Rondo',
  'build-up': 'Build-up',
  'pressing': 'Pressing',
  'finishing': 'Finishing',
  'warm-up': 'Warm-up',
  'ssg': 'Small-sided game',
  'transition': 'Transition',
  'other': 'Other',
}

export const VISIBILITIES = ['private','team','club'] as const
export type Visibility = typeof VISIBILITIES[number]

/**
 * Visibility a newly created drill starts with.
 *
 * Drills used to be created 'private', which meant a coach joining a club
 * opened an empty Tactics library — none of the DOC's work was visible until
 * somebody remembered to change a dropdown per drill. Defaulting to the widest
 * scope the drill actually belongs to matches how a staff of a few coaches
 * works; anything genuinely private can still be set back on the drill itself.
 */
export function defaultDrillVisibility(teamId: string | null | undefined): Visibility {
  return teamId ? 'team' : 'club'
}
