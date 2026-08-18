export const ROLES = {
  DOC: "doc",
  COACH: "coach",
  PARENT: "parent",
  PLAYER: "player",
} as const;

/**
 * Staff run the club; members belong to it.
 *
 * Most role checks in the UI mean "is this person staff?", not "is this person
 * specifically a parent". They were written as `role === 'parent'` only because
 * parent was the sole non-staff role. Adding 'player' in migration 045 made
 * that assumption wrong: a player would have fallen through every one of those
 * checks and been treated as staff.
 */
export function isStaff(role: string | null | undefined): boolean {
  return role === ROLES.DOC || role === ROLES.COACH;
}

/** A parent or a player — belongs to the club, does not run it. */
export function isMember(role: string | null | undefined): boolean {
  return role === ROLES.PARENT || role === ROLES.PLAYER;
}

export type Role = (typeof ROLES)[keyof typeof ROLES];

// The full range a club might field. team-actions.tsx used to carry its own
// divergent copy of this (U6-U19 + Adult) while this list ran U8-U19, so the
// create and edit forms offered different options for the same field.
export const AGE_GROUPS = [
  "U6", "U7", "U8", "U9", "U10", "U11", "U12", "U13",
  "U14", "U15", "U16", "U17", "U18", "U19", "Adult",
] as const;

export type AgeGroup = (typeof AGE_GROUPS)[number];

// Not every team has one. A college program, a senior side or a club's first
// team is just its name, and there was previously no way to say so — the
// dropdown offered youth brackets only, so any such team got a wrong label.
// Stored as an empty string because teams.age_group is NOT NULL.
export const NO_AGE_GROUP = "";
export const NO_AGE_GROUP_LABEL = "No age group";

export const EVENT_TYPES = [
  'practice', 'game', 'tournament', 'camp', 'tryout', 'meeting', 'custom',
] as const

export type EventType = (typeof EVENT_TYPES)[number]

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  practice: 'Practice',
  game: 'Game',
  tournament: 'Tournament',
  camp: 'Camp',
  tryout: 'Tryout',
  meeting: 'Meeting',
  custom: 'Custom',
}

export const EVENT_STATUSES = ['scheduled', 'cancelled'] as const
export type EventStatus = (typeof EVENT_STATUSES)[number]

export const DAYS_OF_WEEK = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
] as const

export const COVERAGE_STATUSES = ['pending', 'accepted', 'escalated', 'resolved'] as const
export type CoverageStatus = (typeof COVERAGE_STATUSES)[number]

export const COVERAGE_STATUS_LABELS: Record<CoverageStatus, string> = {
  pending: 'Needs Coverage',
  accepted: 'Covered',
  escalated: 'Escalated',
  resolved: 'Covered',
}

export const COVERAGE_RESPONSE_TYPES = ['accepted', 'declined'] as const
export type CoverageResponseType = (typeof COVERAGE_RESPONSE_TYPES)[number]
