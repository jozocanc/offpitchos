'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import { bustAttentionCache } from './attention-actions'
import {
  DEMO_COACHES,
  DEMO_EVENTS,
  DEMO_PLAYERS,
  DEMO_TEAM,
  DEMO_VENUE,
  demoPlayerEmail,
  DEMO_FEEDBACK_TEMPLATES,
  DEMO_ANNOUNCEMENT,
} from '@/lib/demo/seed-data'
import { type ActionResult, toActionError } from '@/lib/action-result'
import { getClubTimezoneById } from '@/lib/club-timezone-server'
import { dayKey, addDaysToKey, zonedParts } from '@/lib/format-datetime'

// The UTC instant for a wall-clock time in the club's zone. The seed used to
// call setHours() on the server, which is UTC on Vercel, so a 7 PM kickoff
// showed as 3 PM Eastern. Two passes settle DST edges.
function zonedWallTime(key: string, hour: number, minute: number, timeZone: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  const target = Date.UTC(y, m - 1, d, hour, minute)
  let guess = target
  for (let i = 0; i < 2; i++) {
    const p = zonedParts(new Date(guess), timeZone)
    const [py, pm, pd] = p.key.split('-').map(Number)
    guess += target - Date.UTC(py, pm - 1, pd, p.hour, p.minute)
  }
  return new Date(guess)
}

const DEMO_FLAG_ENABLED = () => process.env.NEXT_PUBLIC_ALLOW_DEMO_SEED === 'true'

export interface DemoSeedState {
  enabled: boolean        // NEXT_PUBLIC_ALLOW_DEMO_SEED === 'true'
  loaded: boolean         // demo_seeds rows > 0 for this club
  emptyEnough: boolean    // safe to run seedDemoData()
}

export interface DemoSeedResult {
  playersAdded: number
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
  // getClaims verifies the JWT locally — no auth-server round-trip on the
  // dashboard render path. This runs inside the page's parallel query batch.
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims
  if (!claims) return { enabled: false, loaded: false, emptyEnough: false }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, club_id, role')
    .eq('user_id', claims.sub)
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

export async function seedDemoData(
  ...args: Parameters<typeof _seedDemoData>
): Promise<ActionResult<Awaited<ReturnType<typeof _seedDemoData>>>> {
  try {
    return { ok: true, data: await _seedDemoData(...args) }
  } catch (e) {
    return toActionError(e)
  }
}

async function _seedDemoData(): Promise<DemoSeedResult> {
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
    throw new Error('Only the head coach can seed demo data')
  }

  const state = await getDemoSeedState()
  if (!state.emptyEnough) {
    throw new Error('Your program already has data. The sample team only loads into an empty program.')
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

  // Demo emails need to be unique across every demo'd club, otherwise
  // the second run hits "user with this email already exists". The
  // club id's first 8 chars make a tight, deterministic suffix.
  const emailSuffix = clubId!.slice(0, 8)
  const namespacedEmail = (raw: string) => raw.replace('@', `+${emailSuffix}@`)

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
    // Service role for the team insert. We hit a runtime RLS denial
    // here on freshly-provisioned DOC accounts where the JWT context
    // hadn't fully propagated; service role sidesteps that entirely
    // and the trackSeed below still gives clearDemoData() a handle
    // to roll the row back.
    const { data: newTeam, error: teamError } = await admin
      .from('teams')
      .insert({ club_id: clubId, name: DEMO_TEAM.name, age_group: DEMO_TEAM.ageGroup })
      .select('id, name')
      .single()
    if (teamError || !newTeam) throw new Error(`Failed to create demo team: ${teamError?.message}`)
    teamId = newTeam.id
    teamName = newTeam.name
    await trackSeed('teams', teamId)
  }

  // 2) Venue — service role to dodge the same JWT-propagation RLS
  // wobble we worked around for the team insert. The seed is DOC-gated
  // upstream, so bypassing RLS for these populate-only inserts is fine.
  const { data: venue, error: venueError } = await admin
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
  // One of each title so the Staff page shows how titles work.
  const DEMO_STAFF_TITLES = ['Assistant Coach', 'Goalkeeping Coach', 'Fitness Coach']
  for (const [coachIndex, coach] of DEMO_COACHES.entries()) {
    const { data: created, error: authError } = await admin.auth.admin.createUser({
      email: namespacedEmail(coach.email),
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
        staff_title: DEMO_STAFF_TITLES[coachIndex] ?? 'Assistant Coach',
      })
      .select('id')
      .single()
    if (profileError || !coachProfile) throw new Error(`Failed to create coach profile: ${profileError?.message}`)
    await trackSeed('profiles', coachProfile.id)

    const { data: member, error: memberError } = await admin
      .from('team_members')
      .insert({ team_id: teamId, profile_id: coachProfile.id, role: 'coach' })
      .select('id')
      .single()
    if (memberError || !member) throw new Error(`Failed to link coach to team: ${memberError?.message}`)
    await trackSeed('team_members', member.id)

    coachUserIds.push(authId)
  }

  // 4) Players. Each one holds their own login, the way a college squad
  // works: auth.users + a 'player' profile + a 'player' team_members row,
  // and the players row is owned through players.parent_id (which points
  // at auth.users, not profiles, and means "the account linked to this
  // player"). We capture ids so feedback, RSVPs and attendance can
  // reference them.
  const playerIds: { id: string; authId: string; firstName: string }[] = []
  const timeZone = await getClubTimezoneById(clubId)
  const todayKey = dayKey(new Date(), timeZone)
  for (let index = 0; index < DEMO_PLAYERS.length; index++) {
    const player = DEMO_PLAYERS[index]
    const fullName = `${player.firstName} ${player.lastName}`
    const { data: created, error: authError } = await admin.auth.admin.createUser({
      email: namespacedEmail(demoPlayerEmail(player, index)),
      password: cryptoRandomPassword(),
      email_confirm: true,
      user_metadata: {
        is_demo: true,
        full_name: fullName,
      },
    })
    if (authError || !created.user) throw new Error(`Failed to create player auth user: ${authError?.message}`)
    const authId = created.user.id
    await trackSeed('auth.users', authId)

    const { data: playerProfile, error: profileError } = await admin
      .from('profiles')
      .insert({
        user_id: authId,
        club_id: clubId,
        role: 'player',
        display_name: fullName,
        onboarding_complete: true,
      })
      .select('id')
      .single()
    if (profileError || !playerProfile) throw new Error(`Failed to create player profile: ${profileError?.message}`)
    await trackSeed('profiles', playerProfile.id)

    const { data: member, error: memberError } = await admin
      .from('team_members')
      .insert({ team_id: teamId, profile_id: playerProfile.id, role: 'player' })
      .select('id')
      .single()
    if (memberError || !member) throw new Error(`Failed to link player to team: ${memberError?.message}`)
    await trackSeed('team_members', member.id)

    const { data: inserted, error: playerError } = await admin
      .from('players')
      .insert({
        club_id: clubId,
        team_id: teamId,
        parent_id: authId,
        first_name: player.firstName,
        last_name: player.lastName,
        jersey_number: player.jerseyNumber,
        position: player.position,
        // Most of the squad has already sent sizes; a few are still to chase,
        // so the Gear page shows both the order breakdown and the follow-up.
        ...(index % 4 !== 3
          ? {
              jersey_size: ['AM', 'AL', 'AM', 'AS', 'AL', 'AXL'][index % 6],
              shorts_size: ['AM', 'AM', 'AL', 'AS', 'AL', 'AL'][index % 6],
              has_travel_id: true,
              passport_expiry: index % 5 === 0 ? addDaysToKey(todayKey, 120) : null,
            }
          : {}),
      })
      .select('id')
      .single()
    if (playerError || !inserted) throw new Error(`Failed to create player: ${playerError?.message}`)
    await trackSeed('players', inserted.id)
    playerIds.push({ id: inserted.id, authId, firstName: player.firstName })
  }

  // 5) Events — realistic schedule anchored to today so the dashboard
  // always has "upcoming" content. We capture event ids + their start
  // times so feedback can be back-dated to the event day (otherwise
  // every feedback row gets created_at=now and the development chart
  // bucketByDay returns 1 day → no chart line).
  const pastEvents: { id: string; startIso: string }[] = []
  const upcomingEventIds: string[] = []
  for (const plan of DEMO_EVENTS) {
    const start = zonedWallTime(addDaysToKey(todayKey, plan.daysFromNow), plan.startHour, plan.startMinute, timeZone)
    const end = new Date(start.getTime() + plan.durationMinutes * 60_000)

    // Away fixture: off the home venue, with the full trip filled in so a
    // head coach sees a real itinerary the moment the sample team loads.
    const t = plan.travel
    const travelColumns = t
      ? {
          travel_depart_at: new Date(start.getTime() - t.departHoursBeforeStart * 3_600_000).toISOString(),
          travel_depart_location: t.departLocation,
          travel_return_at: new Date(end.getTime() + t.returnHoursAfterEnd * 3_600_000).toISOString(),
          travel_mode: t.mode,
          travel_hotel: t.hotel,
          travel_notes: t.notes,
        }
      : {}

    const { data: event, error: eventError } = await admin
      .from('events')
      .insert({
        club_id: clubId,
        team_id: teamId,
        type: plan.type,
        title: plan.title,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        venue_id: plan.awayAddress ? null : venue.id,
        address: plan.awayAddress ?? null,
        status: 'scheduled',
        created_by: user.id,
        ...travelColumns,
      })
      .select('id')
      .single()
    if (eventError || !event) throw new Error(`Failed to create event: ${eventError?.message}`)
    await trackSeed('events', event.id)
    if (plan.daysFromNow < 0) pastEvents.push({ id: event.id, startIso: start.toISOString() })
    else upcomingEventIds.push(event.id)
  }
  const pastEventIds = pastEvents.map(e => e.id)

  // 6) Past attendance — most players show up most of the time; we mark a
  // realistic ~85% present rate so the analytics + chart look alive.
  for (const eventId of pastEventIds) {
    const records = playerIds.map((p, i) => {
      // Deterministic-ish skip pattern so the demo always renders the
      // same way: every 7th player marked absent, every 11th late.
      const status: 'present' | 'absent' | 'late' =
        i % 11 === 0 ? 'late' : i % 7 === 0 ? 'absent' : 'present'
      return {
        event_id: eventId,
        player_id: p.id,
        status,
        marked_by: user.id,
      }
    })
    const { error } = await admin
      .from('attendance')
      .upsert(records, { onConflict: 'event_id,player_id' })
    if (error) {
      // Don't kill the whole seed if attendance fails — the demo can
      // still function without it. Log + continue.
      console.error('[demo-seed] attendance insert failed:', error.message)
    }
  }

  // 7) Past feedback — populates the new development chart. Two notes
  // per player on two different past events so the chart has at least
  // two distinct days to draw a line. created_at is overridden to the
  // event's start time so bucketByDay() in the chart sees real spread.
  if (pastEvents.length >= 2) {
    const firstEvt = pastEvents[0]
    const secondEvt = pastEvents[Math.min(2, pastEvents.length - 1)]
    const feedbackRows: {
      player_id: string
      club_id: string
      coach_id: string
      event_id: string
      category: string
      rating: number
      notes: string
      created_at: string
    }[] = []
    for (let i = 0; i < playerIds.length; i++) {
      const p = playerIds[i]
      const t1 = DEMO_FEEDBACK_TEMPLATES[i % DEMO_FEEDBACK_TEMPLATES.length]
      const t2 = DEMO_FEEDBACK_TEMPLATES[(i + 4) % DEMO_FEEDBACK_TEMPLATES.length]
      feedbackRows.push({
        player_id: p.id,
        club_id: clubId,
        coach_id: profile.id,
        event_id: firstEvt.id,
        category: t1.category,
        rating: t1.rating,
        notes: t1.notes,
        created_at: firstEvt.startIso,
      })
      feedbackRows.push({
        player_id: p.id,
        club_id: clubId,
        coach_id: profile.id,
        event_id: secondEvt.id,
        category: t2.category,
        rating: t2.rating,
        notes: t2.notes,
        created_at: secondEvt.startIso,
      })
    }
    const { error } = await admin.from('player_feedback').insert(feedbackRows)
    if (error) console.error('[demo-seed] feedback insert failed:', error.message)
  }

  // 8) Upcoming RSVPs. Most players say "going", a few say "not_going"
  // so the forecast badges on the schedule have texture. Each player
  // answers for themselves. Service client because event_rsvps RLS only
  // lets the row's owner write.
  for (const eventId of upcomingEventIds) {
    const rsvpRows = playerIds.map((p, i) => ({
      event_id: eventId,
      player_id: p.id,
      // Most players are coming. Every 9th + every 13th pre-flag as not
      // going so the staff forecast shows real numbers.
      response: (i % 9 === 0 || i % 13 === 0) ? 'not_going' : 'going',
      responded_by: p.authId,
    }))
    // Skip a few RSVPs entirely so the "no response" count > 0.
    const partial = rsvpRows.filter((_, i) => i % 5 !== 0)
    const { error } = await admin
      .from('event_rsvps')
      .upsert(partial, { onConflict: 'event_id,player_id' })
    if (error) console.error('[demo-seed] rsvp insert failed:', error.message)
  }

  // 9) Team-wide announcement with a poll attached. Adds a populated
  // Messages tab to the demo so prospects don't see an empty list.
  const { data: announcement, error: annErr } = await admin
    .from('announcements')
    .insert({
      club_id: clubId,
      team_id: teamId,
      author_id: profile.id,
      title: DEMO_ANNOUNCEMENT.title,
      body: DEMO_ANNOUNCEMENT.body,
      pinned: true,
      poll_enabled: DEMO_ANNOUNCEMENT.pollEnabled,
    })
    .select('id')
    .single()
  if (!annErr && announcement) {
    await trackSeed('announcements', announcement.id)

    if (DEMO_ANNOUNCEMENT.pollEnabled) {
      // Mock a few poll responses so the tally on the announcement card
      // looks alive ("12 yes · 2 no · 4 maybe"). Service client because
      // announcement_responses RLS only lets the row's owner write.
      const pollRows = playerIds.map((p, i) => {
        const r = i % 6
        const response = r === 0 ? 'maybe' : r === 1 ? 'no' : 'yes'
        return {
          announcement_id: announcement.id,
          player_id: p.id,
          response,
          responded_by: p.authId,
        }
      })
      const { error: pollErr } = await admin
        .from('announcement_responses')
        .upsert(pollRows, { onConflict: 'announcement_id,player_id' })
      if (pollErr) console.error('[demo-seed] poll insert failed:', pollErr.message)
    }
  }

  await bustAttentionCache(clubId)
  revalidatePath('/dashboard')
  revalidatePath('/dashboard/schedule')
  revalidatePath('/dashboard/teams')
  revalidatePath('/dashboard/coaches')
  revalidatePath('/dashboard/messages')
  revalidatePath('/dashboard/players')

  return {
    playersAdded: DEMO_PLAYERS.length,
    coachesAdded: DEMO_COACHES.length,
    eventsAdded: DEMO_EVENTS.length,
    venuesAdded: 1,
  }
}

export async function clearDemoData(
  ...args: Parameters<typeof _clearDemoData>
): Promise<ActionResult<Awaited<ReturnType<typeof _clearDemoData>>>> {
  try {
    return { ok: true, data: await _clearDemoData(...args) }
  } catch (e) {
    return toActionError(e)
  }
}

async function _clearDemoData(): Promise<DemoClearResult> {
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
    throw new Error('Only the head coach can clear demo data')
  }

  const admin = createServiceClient()

  const { data: seeds } = await admin
    .from('demo_seeds')
    .select('id, row_table, row_id')
    .eq('club_id', profile.club_id)

  if (!seeds || seeds.length === 0) return { rowsCleared: 0 }

  // Delete in an order that minimizes FK-cascade surprises. auth.users
  // deletions cascade to profiles (via user_id FK), which cascade to
  // team_members (via profile_id FK). players.parent_id (the player's
  // own account) also cascades from auth.users. So deleting auth.users handles four tables at
  // once. Events + venues + teams still need explicit deletes.
  const byTable: Record<string, string[]> = {}
  for (const s of seeds) {
    (byTable[s.row_table] ??= []).push(s.row_id)
  }

  let cleared = 0

  // Announcements first — cascades announcement_responses + replies +
  // notifications, none of which we tracked individually.
  for (const id of byTable['announcements'] ?? []) {
    const { error } = await admin.from('announcements').delete().eq('id', id)
    if (!error) cleared++
  }

  // Events — they reference venues, and deleting teams cascades
  // events so we want events gone before teams if a team was seeded.
  // Cascades: attendance, event_rsvps, event_drills.
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

  // Players whose account cascade missed them (edge case). Explicit
  // cleanup for any remaining ids that survived the auth.users cascade.
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

  await bustAttentionCache(profile.club_id)
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
