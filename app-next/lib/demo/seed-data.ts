// Demo fixtures for seedDemoData().
//
// Names intentionally reflect a realistic college soccer roster, with
// the international mix a junior college program usually carries, and
// not obviously fake. The dashboard banner
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

export const DEMO_COACHES: DemoPerson[] = [
  { firstName: 'Carlos',   lastName: 'Mendoza',   email: `carlos.mendoza.demo1@${DEMO_EMAIL_DOMAIN}` },
  { firstName: 'Dave',     lastName: 'Sullivan',  email: `dave.sullivan.demo2@${DEMO_EMAIL_DOMAIN}` },
  { firstName: 'Andre',    lastName: 'Beaumont',  email: `andre.beaumont.demo3@${DEMO_EMAIL_DOMAIN}` },
]

export interface DemoPlayer {
  firstName: string
  lastName: string
  jerseyNumber: number
  position: string
  // Every demo player holds their own login (role 'player'), owned
  // through players.parent_id. The email is built from the name at seed
  // time, see demoPlayerEmail().
}

// Build a demo player's login email. Namespaced per club at seed time.
export function demoPlayerEmail(player: DemoPlayer, index: number): string {
  const slug = `${player.firstName}.${player.lastName}`.toLowerCase().replace(/[^a-z.]/g, '')
  return `${slug}.player${index + 1}@${DEMO_EMAIL_DOMAIN}`
}

// A college-sized squad: 22 players, two keepers, full depth at every
// line so the roster, attendance and RSVP views look like a real
// program in season.
export const DEMO_PLAYERS: DemoPlayer[] = [
  { firstName: 'Lucas',     lastName: 'Andersson',  jerseyNumber: 1,  position: 'Goalkeeper' },
  { firstName: 'Tomas',     lastName: 'Varga',      jerseyNumber: 24, position: 'Goalkeeper' },

  { firstName: 'Marcus',    lastName: 'Washington', jerseyNumber: 2,  position: 'Defender' },
  { firstName: 'Liam',      lastName: "O'Brien",    jerseyNumber: 3,  position: 'Defender' },
  { firstName: 'Noah',      lastName: 'Silva',      jerseyNumber: 4,  position: 'Defender' },
  { firstName: 'Kai',       lastName: 'Nguyen',     jerseyNumber: 5,  position: 'Defender' },
  { firstName: 'Caleb',     lastName: 'Williams',   jerseyNumber: 6,  position: 'Defender' },
  { firstName: 'Jordan',    lastName: 'Thompson',   jerseyNumber: 16, position: 'Defender' },
  { firstName: 'Samuel',    lastName: 'Okafor',     jerseyNumber: 22, position: 'Defender' },

  { firstName: 'Mateo',     lastName: 'Hernandez',  jerseyNumber: 10, position: 'Midfielder' },
  { firstName: 'Ethan',     lastName: 'Chen',       jerseyNumber: 8,  position: 'Midfielder' },
  { firstName: 'Khalil',    lastName: 'Brooks',     jerseyNumber: 12, position: 'Midfielder' },
  { firstName: 'Gabriel',   lastName: 'Bianchi',    jerseyNumber: 13, position: 'Midfielder' },
  { firstName: 'Jaxon',     lastName: 'Park',       jerseyNumber: 14, position: 'Midfielder' },
  { firstName: 'Daniel',    lastName: 'Costa',      jerseyNumber: 15, position: 'Midfielder' },
  { firstName: 'Oliver',    lastName: 'Haaland',    jerseyNumber: 18, position: 'Midfielder' },
  { firstName: 'Rafael',    lastName: 'Duarte',     jerseyNumber: 20, position: 'Midfielder' },

  { firstName: 'Diego',     lastName: 'Rodriguez',  jerseyNumber: 7,  position: 'Forward' },
  { firstName: 'Arjun',     lastName: 'Patel',      jerseyNumber: 9,  position: 'Forward' },
  { firstName: 'Minho',     lastName: 'Kim',        jerseyNumber: 11, position: 'Forward' },
  { firstName: 'Luca',      lastName: 'Russo',      jerseyNumber: 17, position: 'Forward' },
  { firstName: 'Amari',     lastName: 'Johnson',    jerseyNumber: 19, position: 'Forward' },
]

// Invented-but-plausible campus venue. Does not reference a real
// stadium. The name and address are fictional so we don't misdirect a
// head coach to an address that isn't theirs.
export const DEMO_VENUE = {
  name: 'Riverbend College Soccer Stadium',
  address: '2200 Riverbend Drive, Riverbend, TX 75701',
}

// Team used when the club has no team yet. A college program has no
// age bracket, so age_group is the NO_AGE_GROUP empty string.
export const DEMO_TEAM = {
  name: "Men's Soccer",
  ageGroup: '',
}

export interface DemoEventPlan {
  type: 'practice' | 'game'
  title: string
  // Offset in days from today at seed time. Negative = past event.
  daysFromNow: number
  startHour: number // local time, 24h
  startMinute: number
  durationMinutes: number
}

// Two-week window: 7 days of past events (so attendance + feedback have
// somewhere to live) and 7 days of upcoming (so RSVPs + the schedule
// view show real cards). A real prospect's first impression is "this
// looks like a busy season already running" — that's what closes.
export const DEMO_EVENTS: DemoEventPlan[] = [
  // PAST
  { type: 'practice', title: 'Training',                      daysFromNow: -7, startHour: 15, startMinute: 30, durationMinutes: 120 },
  { type: 'practice', title: 'Training',                      daysFromNow: -5, startHour: 15, startMinute: 30, durationMinutes: 120 },
  { type: 'game',     title: 'Home vs Lakeview College',      daysFromNow: -3, startHour: 19, startMinute: 0,  durationMinutes: 110 },
  { type: 'practice', title: 'Recovery + Film',               daysFromNow: -2, startHour: 15, startMinute: 30, durationMinutes: 90 },
  // UPCOMING
  { type: 'practice', title: 'Training',                      daysFromNow: 1, startHour: 15, startMinute: 30, durationMinutes: 120 },
  { type: 'practice', title: 'Pre-travel Training',           daysFromNow: 3, startHour: 15, startMinute: 30, durationMinutes: 90 },
  { type: 'game',     title: 'Away at Prairie State College', daysFromNow: 5, startHour: 19, startMinute: 0,  durationMinutes: 110 },
  { type: 'practice', title: 'Training',                      daysFromNow: 8, startHour: 15, startMinute: 30, durationMinutes: 120 },
]

// Feedback templates per category. Each one is a plausible coach line
// pulled from common college-soccer note patterns. We pick at random per
// player so the development chart shows a real-looking spread.
export const DEMO_FEEDBACK_TEMPLATES: { category: 'technical' | 'tactical' | 'physical' | 'attitude' | 'general'; rating: number; notes: string }[] = [
  { category: 'technical', rating: 5, notes: 'First touch was money tonight — every reception clean.' },
  { category: 'technical', rating: 4, notes: 'Nice progress on weak-foot passing during rondos.' },
  { category: 'technical', rating: 3, notes: 'Decent ball striking but needs to lock the standing foot.' },
  { category: 'tactical',  rating: 5, notes: 'Read the press perfectly and kept switching the field.' },
  { category: 'tactical',  rating: 4, notes: 'Good defensive cover — slid in to plug the gap on overloads.' },
  { category: 'tactical',  rating: 3, notes: 'Lost shape a couple times when we transitioned. Keep working on it.' },
  { category: 'physical',  rating: 5, notes: 'Engine never stopped — lasted 90 minutes at full pace.' },
  { category: 'physical',  rating: 4, notes: 'Recovered well between sprints. Strong second half.' },
  { category: 'attitude',  rating: 5, notes: 'Lifted the whole bench — set the tone before kickoff.' },
  { category: 'attitude',  rating: 4, notes: 'Coachable today, took the corrections without sulking.' },
  { category: 'general',   rating: 4, notes: 'Quietly one of the best performances of the night.' },
  { category: 'general',   rating: 3, notes: 'Solid shift — nothing flashy but did the job.' },
]

export const DEMO_ANNOUNCEMENT = {
  title: 'Away trip to Prairie State: travel check',
  body: "Bus leaves the field house at 9:00 AM Friday. Bring your travel polo, both kits and your student ID. Tap below by Wednesday so we can lock the hotel rooming list and meal count.",
  pollEnabled: true,
}
