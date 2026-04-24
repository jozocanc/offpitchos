// Demo fixtures for seedDemoData().
//
// Names intentionally reflect a realistic South Florida youth soccer
// roster — multi-cultural, not obviously fake. The dashboard banner
// (plus demo_seeds row pointers and raw_user_meta_data.is_demo on the
// auth.users rows) does all the "this is demo data" labeling; the
// individual rows themselves read as real so the dashboard looks
// populated instead of staged.

export const DEMO_EMAIL_DOMAIN = 'example.test'

export interface DemoPerson {
  firstName: string
  lastName: string
  email: string
}

// Three fake parents, each email `@example.test` so isDemoRecipient()
// short-circuits every outbound send during seeding.
export const DEMO_PARENTS: DemoPerson[] = [
  { firstName: 'Sofia',    lastName: 'Rodriguez', email: `sofia.rodriguez.demo1@${DEMO_EMAIL_DOMAIN}` },
  { firstName: 'Priya',    lastName: 'Patel',     email: `priya.patel.demo2@${DEMO_EMAIL_DOMAIN}` },
  { firstName: 'Jennifer', lastName: 'Kim',       email: `jennifer.kim.demo3@${DEMO_EMAIL_DOMAIN}` },
]

export const DEMO_COACHES: DemoPerson[] = [
  { firstName: 'Carlos', lastName: 'Mendoza',  email: `carlos.mendoza.demo1@${DEMO_EMAIL_DOMAIN}` },
  { firstName: 'Dave',   lastName: 'Sullivan', email: `dave.sullivan.demo2@${DEMO_EMAIL_DOMAIN}` },
]

export interface DemoPlayer {
  firstName: string
  lastName: string
  jerseyNumber: number
  position: string
  // parentIndex: 0, 1, or 2 — which of DEMO_PARENTS owns this kid.
  // Four kids per parent so all 12 have a claimed parent.
  parentIndex: 0 | 1 | 2
}

export const DEMO_PLAYERS: DemoPlayer[] = [
  { firstName: 'Diego',   lastName: 'Rodriguez', jerseyNumber: 7,  position: 'Forward',    parentIndex: 0 },
  { firstName: 'Mateo',   lastName: 'Hernandez', jerseyNumber: 10, position: 'Midfielder', parentIndex: 0 },
  { firstName: 'Noah',    lastName: 'Silva',     jerseyNumber: 4,  position: 'Defender',   parentIndex: 0 },
  { firstName: 'Lucas',   lastName: 'Andersson', jerseyNumber: 1,  position: 'Goalkeeper', parentIndex: 0 },

  { firstName: 'Arjun',   lastName: 'Patel',     jerseyNumber: 9,  position: 'Forward',    parentIndex: 1 },
  { firstName: 'Ethan',   lastName: 'Chen',      jerseyNumber: 8,  position: 'Midfielder', parentIndex: 1 },
  { firstName: 'Kai',     lastName: 'Nguyen',    jerseyNumber: 5,  position: 'Defender',   parentIndex: 1 },
  { firstName: 'Caleb',   lastName: 'Williams',  jerseyNumber: 6,  position: 'Defender',   parentIndex: 1 },

  { firstName: 'Minho',   lastName: 'Kim',       jerseyNumber: 11, position: 'Forward',    parentIndex: 2 },
  { firstName: 'Jaxon',   lastName: 'Park',      jerseyNumber: 14, position: 'Midfielder', parentIndex: 2 },
  { firstName: 'Liam',    lastName: "O'Brien",   jerseyNumber: 3,  position: 'Defender',   parentIndex: 2 },
  { firstName: 'Marcus',  lastName: 'Washington', jerseyNumber: 2, position: 'Defender',   parentIndex: 2 },
]

// Invented-but-plausible SoFla venue. Does not reference a real park —
// the name and address are fictional so we don't misdirect a DOC to an
// address that isn't theirs.
export const DEMO_VENUE = {
  name: 'Riverbend Soccer Park',
  address: '2200 Riverbend Drive, Doral, FL 33172',
}

export interface DemoEventPlan {
  type: 'practice' | 'game'
  title: string
  // Offset in days from today at seed time.
  daysFromNow: number
  startHour: number // local time, 24h
  startMinute: number
  durationMinutes: number
}

// Three events scheduled within the next 7 days. Each is in the future
// so the DOC sees "3 upcoming" on the dashboard even on day 1.
// seedDemoData() picks the next occurrence of each weekday so the
// schedule reads as "realistic current season" regardless of today.
export const DEMO_EVENTS: DemoEventPlan[] = [
  { type: 'practice', title: 'U14 Practice', daysFromNow: 2, startHour: 18, startMinute: 0, durationMinutes: 90 },
  { type: 'practice', title: 'U14 Practice', daysFromNow: 4, startHour: 18, startMinute: 0, durationMinutes: 90 },
  { type: 'game',     title: 'U14 Home Game', daysFromNow: 6, startHour: 10, startMinute: 0, durationMinutes: 75 },
]
