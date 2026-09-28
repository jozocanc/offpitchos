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
 * specifically a player". Use these helpers rather than comparing role strings.
 *
 * PARENT is legacy: the product is team-only (staff + players) and nothing in
 * the UI offers or defaults to it any more. It stays so existing 'parent' rows
 * keep resolving as members instead of falling through and being treated as
 * staff.
 */
export function isStaff(role: string | null | undefined): boolean {
  return role === ROLES.DOC || role === ROLES.COACH;
}

/** A player (or a legacy 'parent' row). Belongs to the team, does not run it. */
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

// One head coach (role 'doc', the person who created the team) and a staff of
// coaches under them. A title is only a label: every titled staff member is
// role 'coach' with the same permissions. Stored in profiles.staff_title.
export const STAFF_TITLES = [
  'Assistant Coach',
  'Goalkeeping Coach',
  'Fitness Coach',
  'Video Analyst',
] as const

export const DEFAULT_STAFF_TITLE = 'Assistant Coach'

export function roleLabel(role: string | null | undefined, staffTitle?: string | null): string {
  if (role === ROLES.DOC) return 'Head Coach'
  if (role === ROLES.COACH) return staffTitle || DEFAULT_STAFF_TITLE
  if (role === ROLES.PLAYER || role === ROLES.PARENT) return 'Player'
  return 'Member'
}

// Kit sizes. Stored values stay 'AS'/'YXS' etc. (existing rows use them);
// only the order and display labels changed when the product went college:
// adult sizes first, youth kept available after them.
export const GEAR_SIZES = ['AS', 'AM', 'AL', 'AXL', 'AXXL', 'YXS', 'YS', 'YM', 'YL', 'YXL'] as const

const GEAR_SIZE_LABELS: Record<string, string> = {
  AS: 'S',
  AM: 'M',
  AL: 'L',
  AXL: 'XL',
  AXXL: 'XXL',
  YXS: 'Youth XS',
  YS: 'Youth S',
  YM: 'Youth M',
  YL: 'Youth L',
  YXL: 'Youth XL',
}

export function gearSizeLabel(size: string | null | undefined): string {
  if (!size) return ''
  return GEAR_SIZE_LABELS[size] ?? size
}
