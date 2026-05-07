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

// Five fake parents — a few more than before so the team feels active
// when a prospect drills into Messages or Coaches.
export const DEMO_PARENTS: DemoPerson[] = [
  { firstName: 'Sofia',    lastName: 'Rodriguez', email: `sofia.rodriguez.demo1@${DEMO_EMAIL_DOMAIN}` },
  { firstName: 'Priya',    lastName: 'Patel',     email: `priya.patel.demo2@${DEMO_EMAIL_DOMAIN}` },
  { firstName: 'Jennifer', lastName: 'Kim',       email: `jennifer.kim.demo3@${DEMO_EMAIL_DOMAIN}` },
  { firstName: 'Marco',    lastName: 'Russo',     email: `marco.russo.demo4@${DEMO_EMAIL_DOMAIN}` },
  { firstName: 'Aisha',    lastName: 'Williams',  email: `aisha.williams.demo5@${DEMO_EMAIL_DOMAIN}` },
]

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
  // parentIndex points into DEMO_PARENTS so we can wire the player to a
  // real parent row. Spread roughly evenly across all parents so the
  // "claim a kid" UX has visible diversity.
  parentIndex: 0 | 1 | 2 | 3 | 4
}

export const DEMO_PLAYERS: DemoPlayer[] = [
  { firstName: 'Diego',     lastName: 'Rodriguez',  jerseyNumber: 7,  position: 'Forward',    parentIndex: 0 },
  { firstName: 'Mateo',     lastName: 'Hernandez',  jerseyNumber: 10, position: 'Midfielder', parentIndex: 0 },
  { firstName: 'Noah',      lastName: 'Silva',      jerseyNumber: 4,  position: 'Defender',   parentIndex: 0 },
  { firstName: 'Lucas',     lastName: 'Andersson',  jerseyNumber: 1,  position: 'Goalkeeper', parentIndex: 0 },

  { firstName: 'Arjun',     lastName: 'Patel',      jerseyNumber: 9,  position: 'Forward',    parentIndex: 1 },
  { firstName: 'Ethan',     lastName: 'Chen',       jerseyNumber: 8,  position: 'Midfielder', parentIndex: 1 },
  { firstName: 'Kai',       lastName: 'Nguyen',     jerseyNumber: 5,  position: 'Defender',   parentIndex: 1 },
  { firstName: 'Caleb',     lastName: 'Williams',   jerseyNumber: 6,  position: 'Defender',   parentIndex: 1 },

  { firstName: 'Minho',     lastName: 'Kim',        jerseyNumber: 11, position: 'Forward',    parentIndex: 2 },
  { firstName: 'Jaxon',     lastName: 'Park',       jerseyNumber: 14, position: 'Midfielder', parentIndex: 2 },
  { firstName: 'Liam',      lastName: "O'Brien",    jerseyNumber: 3,  position: 'Defender',   parentIndex: 2 },
  { firstName: 'Marcus',    lastName: 'Washington', jerseyNumber: 2,  position: 'Defender',   parentIndex: 2 },

  { firstName: 'Luca',      lastName: 'Russo',      jerseyNumber: 17, position: 'Forward',    parentIndex: 3 },
  { firstName: 'Gabriel',   lastName: 'Bianchi',    jerseyNumber: 13, position: 'Midfielder', parentIndex: 3 },
  { firstName: 'Daniel',    lastName: 'Costa',      jerseyNumber: 15, position: 'Midfielder', parentIndex: 3 },

  { firstName: 'Amari',     lastName: 'Johnson',    jerseyNumber: 19, position: 'Forward',    parentIndex: 4 },
  { firstName: 'Jordan',    lastName: 'Thompson',   jerseyNumber: 16, position: 'Defender',   parentIndex: 4 },
  { firstName: 'Khalil',    lastName: 'Brooks',     jerseyNumber: 12, position: 'Midfielder', parentIndex: 4 },
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
  { type: 'practice', title: 'Tuesday Practice',  daysFromNow: -7, startHour: 18, startMinute: 0, durationMinutes: 90 },
  { type: 'practice', title: 'Thursday Practice', daysFromNow: -5, startHour: 18, startMinute: 0, durationMinutes: 90 },
  { type: 'game',     title: 'Home Game vs Vipers FC', daysFromNow: -3, startHour: 10, startMinute: 0, durationMinutes: 75 },
  { type: 'practice', title: 'Tuesday Practice',  daysFromNow: -2, startHour: 18, startMinute: 0, durationMinutes: 90 },
  // UPCOMING
  { type: 'practice', title: 'Tuesday Practice',  daysFromNow: 1, startHour: 18, startMinute: 0, durationMinutes: 90 },
  { type: 'practice', title: 'Thursday Practice', daysFromNow: 3, startHour: 18, startMinute: 0, durationMinutes: 90 },
  { type: 'game',     title: 'Home Game vs Coral Storm', daysFromNow: 5, startHour: 10, startMinute: 0, durationMinutes: 75 },
  { type: 'practice', title: 'Tuesday Practice',  daysFromNow: 8, startHour: 18, startMinute: 0, durationMinutes: 90 },
]

// Feedback templates per category. Each one is a plausible coach line
// pulled from common youth-soccer note patterns. We pick at random per
// player so the development chart shows a real-looking spread.
export const DEMO_FEEDBACK_TEMPLATES: { category: 'technical' | 'tactical' | 'physical' | 'attitude' | 'general'; rating: number; notes: string }[] = [
  { category: 'technical', rating: 5, notes: 'First touch was money tonight — every reception clean.' },
  { category: 'technical', rating: 4, notes: 'Nice progress on weak-foot passing during rondos.' },
  { category: 'technical', rating: 3, notes: 'Decent ball striking but needs to lock the standing foot.' },
  { category: 'tactical',  rating: 5, notes: 'Read the press perfectly and kept switching the field.' },
  { category: 'tactical',  rating: 4, notes: 'Good defensive cover — slid in to plug the gap on overloads.' },
  { category: 'tactical',  rating: 3, notes: 'Lost shape a couple times when we transitioned. Keep working on it.' },
  { category: 'physical',  rating: 5, notes: 'Engine never stopped — lasted 70 minutes at full pace.' },
  { category: 'physical',  rating: 4, notes: 'Recovered well between sprints. Strong second half.' },
  { category: 'attitude',  rating: 5, notes: 'Lifted the whole bench — set the tone before kickoff.' },
  { category: 'attitude',  rating: 4, notes: 'Coachable today, took the corrections without sulking.' },
  { category: 'general',   rating: 4, notes: 'Quietly one of the best performances of the night.' },
  { category: 'general',   rating: 3, notes: 'Solid shift — nothing flashy but did the job.' },
]

export const DEMO_ANNOUNCEMENT = {
  title: 'Tournament weekend — carpool sign-up',
  body: "Hey families! We're heading up to the Fort Lauderdale Spring Cup next weekend. Tap below to RSVP so we can sort carpools by Wednesday. Reach out if you can host extra kids in your car.",
  pollEnabled: true,
}
