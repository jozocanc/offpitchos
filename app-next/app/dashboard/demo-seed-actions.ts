'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import {
  DEMO_COACHES,
  DEMO_EVENTS,
  DEMO_PARENTS,
  DEMO_PLAYERS,
  DEMO_VENUE,
} from '@/lib/demo/seed-data'

const DEMO_FLAG_ENABLED = () => process.env.NEXT_PUBLIC_ALLOW_DEMO_SEED === 'true'

export interface DemoSeedState {
  enabled: boolean        // NEXT_PUBLIC_ALLOW_DEMO_SEED === 'true'
  loaded: boolean         // demo_seeds rows > 0 for this club
  emptyEnough: boolean    // safe to run seedDemoData()
}

export interface DemoSeedResult {
  playersAdded: number
  parentsAdded: number
  coachesAdded: number
  eventsAdded: number
  venuesAdded: number
}

export interface DemoClearResult {
  rowsCleared: number
}

// Visibility state for the dashboard button. Does NOT require service
// role — the `demo_seeds` SELECT policy lets the DOC read their own
// club's tracking rows directly.
export async function getDemoSeedState(): Promise<DemoSeedState> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { enabled: false, loaded: false, emptyEnough: false }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, club_id, role')
    .eq('user_id', user.id)
    .single()

  if (!profile?.club_id || profile.role !== 'doc') {
    return { enabled: DEMO_FLAG_ENABLED(), loaded: false, emptyEnough: false }
  }

  const { count: demoCount } = await supabase
    .from('demo_seeds')
    .select('id', { count: 'exact', head: true })
    .eq('club_id', profile.club_id)

  const loaded = (demoCount ?? 0) > 0

  // Empty-enough = 0 players, 0 events, 0 non-DOC team members. Teams
  // are allowed to be 0 or 1 (the wizard-created team) — anything more
  // means the DOC has started building out real data and we stay out.
  const [{ count: playerCount }, { count: eventCount }, { count: memberCount }, { count: teamCount }] =
    await Promise.all([
      supabase.from('players').select('id', { count: 'exact', head: true }).eq('club_id', profile.club_id),
      supabase.from('events').select('id', { count: 'exact', head: true }).eq('club_id', profile.club_id),
      supabase
        .from('team_members')
        .select('id, teams!inner(club_id)', { count: 'exact', head: true })
        .eq('teams.club_id', profile.club_id),
      supabase.from('teams').select('id', { count: 'exact', head: true }).eq('club_id', profile.club_id),
    ])

  const emptyEnough =
    (playerCount ?? 0) === 0 &&
    (eventCount ?? 0) === 0 &&
    (memberCount ?? 0) === 0 &&
    (teamCount ?? 0) <= 1 &&
    !loaded

  return {
    enabled: DEMO_FLAG_ENABLED(),
    loaded,
    emptyEnough,
  }
}

export async function seedDemoData(): Promise<DemoSeedResult> {
  if (!DEMO_FLAG_ENABLED()) {
    throw new Error('Demo seeding is disabled in this environment')
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, club_id, role')
    .eq('user_id', user.id)
    .single()

  if (!profile?.club_id || profile.role !== 'doc') {
    throw new Error('Only the Director of Coaching can seed demo data')
  }

  const state = await getDemoSeedState()
  if (!state.emptyEnough) {
    throw new Error('Club is not empty — clear existing data before seeding')
  }

  const clubId = profile.club_id

  // Service-role client scoped to this function. Used only for:
  //   - auth.users (admin API)
  //   - profiles (RLS blocks the DOC from inserting profiles for other
  //     user_ids)
  //   - demo_seeds (no write policy defined; service role only)
  // Every other insert goes through `supabase` (the caller's client)
  // so RLS is enforced end-to-end.
  const admin = createServiceClient()

  const trackSeed = async (rowTable: string, rowId: string) => {
    await admin.from('demo_seeds').insert({ club_id: clubId, row_table: rowTable, row_id: rowId })
  }

  // 1) Make sure the club has a team. The wizard always creates one,
  // but if a DOC somehow arrived here with zero teams we'll create a
  // sensible default so the rest of the seed can proceed.
  const { data: existingTeams } = await supabase
    .from('teams')
    .select('id, name, age_group')
    .eq('club_id', clubId)
    .limit(1)

  let teamId: string
  let teamName: string
  if (existingTeams && existingTeams.length > 0) {
    teamId = existingTeams[0].id
    teamName = existingTeams[0].name
  } else {
    const { data: newTeam, error: teamError } = await supabase
      .from('teams')
      .insert({ club_id: clubId, name: 'U14 Boys', age_group: 'U14' })
      .select('id, name')
      .single()
    if (teamError || !newTeam) throw new Error(`Failed to create demo team: ${teamError?.message}`)
    teamId = newTeam.id
    teamName = newTeam.name
    await trackSeed('teams', teamId)
  }

  // 2) Venue — via caller's client so RLS on venues applies.
  const { data: venue, error: venueError } = await supabase
    .from('venues')
    .insert({ club_id: clubId, name: DEMO_VENUE.name, address: DEMO_VENUE.address })
    .select('id')
    .single()
  if (venueError || !venue) throw new Error(`Failed to create demo venue: ${venueError?.message}`)
  await trackSeed('venues', venue.id)

  // 3) Fake coaches — auth.users + profiles via service role, then
  // team_members via the caller's client (the DOC has RLS write access
  // on team_members within their own club).
  const coachUserIds: string[] = []
  for (const coach of DEMO_COACHES) {
    const { data: created, error: authError } = await admin.auth.admin.createUser({
      email: coach.email,
      password: cryptoRandomPassword(),
      email_confirm: true,
      user_metadata: {
        is_demo: true,
        full_name: `${coach.firstName} ${coach.lastName}`,
      },
    })
    if (authError || !created.user) throw new Error(`Failed to create coach auth user: ${authError?.message}`)
    const authId = created.user.id
    await trackSeed('auth.users', authId)

    const { data: coachProfile, error: profileError } = await admin
      .from('profiles')
      .insert({
        user_id: authId,
        club_id: clubId,
        role: 'coach',
        display_name: `${coach.firstName} ${coach.lastName}`,
        onboarding_complete: true,
      })
      .select('id')
      .single()
    if (profileError || !coachProfile) throw new Error(`Failed to create coach profile: ${profileError?.message}`)
    await trackSeed('profiles', coachProfile.id)

    const { data: member, error: memberError } = await supabase
      .from('team_members')
      .insert({ team_id: teamId, profile_id: coachProfile.id, role: 'coach' })
      .select('id')
      .single()
    if (memberError || !member) throw new Error(`Failed to link coach to team: ${memberError?.message}`)
    await trackSeed('team_members', member.id)

    coachUserIds.push(authId)
  }

  // 4) Fake parents — same pattern, role='parent'. Collect their auth
  // ids so players can reference them via players.parent_id.
  const parentAuthIds: string[] = []
  for (const parent of DEMO_PARENTS) {
    const { data: created, error: authError } = await admin.auth.admin.createUser({
      email: parent.email,
      password: cryptoRandomPassword(),
      email_confirm: true,
      user_metadata: {
        is_demo: true,
        full_name: `${parent.firstName} ${parent.lastName}`,
      },
    })
    if (authError || !created.user) throw new Error(`Failed to create parent auth user: ${authError?.message}`)
    const authId = created.user.id
    await trackSeed('auth.users', authId)

    const { data: parentProfile, error: profileError } = await admin
      .from('profiles')
      .insert({
        user_id: authId,
        club_id: clubId,
        role: 'parent',
        display_name: `${parent.firstName} ${parent.lastName}`,
        onboarding_complete: true,
      })
      .select('id')
      .single()
    if (profileError || !parentProfile) throw new Error(`Failed to create parent profile: ${profileError?.message}`)
    await trackSeed('profiles', parentProfile.id)

    const { data: member, error: memberError } = await supabase
      .from('team_members')
      .insert({ team_id: teamId, profile_id: parentProfile.id, role: 'parent' })
      .select('id')
      .single()
    if (memberError || !member) throw new Error(`Failed to link parent to team: ${memberError?.message}`)
    await trackSeed('team_members', member.id)

    parentAuthIds.push(authId)
  }

  // 5) Players — 12 kids split 4-4-4 across the 3 parents. `parent_id`
  // on players points at auth.users, not profiles (per schema).
  for (const player of DEMO_PLAYERS) {
    const parentAuthId = parentAuthIds[player.parentIndex]
    const { data: inserted, error: playerError } = await supabase
      .from('players')
      .insert({
        club_id: clubId,
        team_id: teamId,
        parent_id: parentAuthId,
        first_name: player.firstName,
        last_name: player.lastName,
        jersey_number: player.jerseyNumber,
        position: player.position,
      })
      .select('id')
      .single()
    if (playerError || !inserted) throw new Error(`Failed to create player: ${playerError?.message}`)
    await trackSeed('players', inserted.id)
  }

  // 6) Events — realistic schedule anchored to today so the dashboard
  // always has "upcoming" content.
  const now = new Date()
  for (const plan of DEMO_EVENTS) {
    const start = new Date(now)
    start.setDate(start.getDate() + plan.daysFromNow)
    start.setHours(plan.startHour, plan.startMinute, 0, 0)
    const end = new Date(start.getTime() + plan.durationMinutes * 60_000)

    const { data: event, error: eventError } = await supabase
      .from('events')
      .insert({
        club_id: clubId,
        team_id: teamId,
        type: plan.type,
        title: plan.title.replace('U14', teamName),
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        venue_id: venue.id,
        status: 'scheduled',
        created_by: user.id,
      })
      .select('id')
      .single()
    if (eventError || !event) throw new Error(`Failed to create event: ${eventError?.message}`)
    await trackSeed('events', event.id)
  }

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/schedule')
  revalidatePath('/dashboard/teams')
  revalidatePath('/dashboard/coaches')

  return {
    playersAdded: DEMO_PLAYERS.length,
    parentsAdded: DEMO_PARENTS.length,
    coachesAdded: DEMO_COACHES.length,
    eventsAdded: DEMO_EVENTS.length,
    venuesAdded: 1,
  }
}

export async function clearDemoData(): Promise<DemoClearResult> {
  if (!DEMO_FLAG_ENABLED()) {
    throw new Error('Demo seeding is disabled in this environment')
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id, role')
    .eq('user_id', user.id)
    .single()

  if (!profile?.club_id || profile.role !== 'doc') {
    throw new Error('Only the Director of Coaching can clear demo data')
  }

  const admin = createServiceClient()

  const { data: seeds } = await admin
    .from('demo_seeds')
    .select('id, row_table, row_id')
    .eq('club_id', profile.club_id)

  if (!seeds || seeds.length === 0) return { rowsCleared: 0 }

  // Delete in an order that minimizes FK-cascade surprises. auth.users
  // deletions cascade to profiles (via user_id FK), which cascade to
  // team_members (via profile_id FK). players.parent_id also cascades
  // from auth.users. So deleting auth.users handles four tables at
  // once. Events + venues + teams still need explicit deletes.
  const byTable: Record<string, string[]> = {}
  for (const s of seeds) {
    (byTable[s.row_table] ??= []).push(s.row_id)
  }

  let cleared = 0

  // Events first — they reference venues, and deleting teams cascades
  // events so we want events gone before teams if a team was seeded.
  for (const id of byTable['events'] ?? []) {
    const { error } = await admin.from('events').delete().eq('id', id)
    if (!error) cleared++
  }

  for (const id of byTable['venues'] ?? []) {
    const { error } = await admin.from('venues').delete().eq('id', id)
    if (!error) cleared++
  }

  // auth.users — cascades profiles, team_members, players (parent_id).
  for (const id of byTable['auth.users'] ?? []) {
    const { error } = await admin.auth.admin.deleteUser(id)
    if (!error) cleared++
  }

  // Players not linked to a demo parent (edge case) — explicit cleanup
  // for any remaining ids that survived the parent cascade.
  for (const id of byTable['players'] ?? []) {
    const { error } = await admin.from('players').delete().eq('id', id)
    if (!error) cleared++
  }

  for (const id of byTable['teams'] ?? []) {
    const { error } = await admin.from('teams').delete().eq('id', id)
    if (!error) cleared++
  }

  // Finally, drop the tracking rows themselves.
  await admin.from('demo_seeds').delete().eq('club_id', profile.club_id)

  revalidatePath('/dashboard')
  revalidatePath('/dashboard/schedule')
  revalidatePath('/dashboard/teams')
  revalidatePath('/dashboard/coaches')

  return { rowsCleared: cleared }
}

// Random password for seeded accounts. Never surfaced — the demo users
// exist solely so notification counts and team-membership displays
// behave like a populated club.
function cryptoRandomPassword(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24))
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}
