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
