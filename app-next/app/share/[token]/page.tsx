import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { createServiceClient } from '@/lib/supabase/service'
import { EVENT_TYPE_LABELS, type EventType } from '@/lib/constants'
import { formatShortDate, formatTime as fmtTime } from '@/lib/format-datetime'
import { getClubTimezoneById } from '@/lib/club-timezone-server'

export const dynamic = 'force-dynamic'
// Public pages should never get cached at the framework level — schedule
// changes need to be reflected on the next page load even if a parent's
// browser opens the link an hour later.

interface RosterRow {
  player_id: string
  first_name: string
  last_name: string
  jersey_number: number | null
  player_position: string | null
}

interface ScheduleRow {
  event_id: string
  event_type: string
  title: string
  start_time: string
  end_time: string
  status: string
  venue_name: string | null
  venue_address: string | null
  event_address: string | null
}

interface TeamRow {
  team_id: string
  club_id: string
  team_name: string
  age_group: string
}

async function loadShare(token: string) {
  const service = createServiceClient()

  // Fail fast if the token isn't a UUID — keeps the SECURITY DEFINER
  // function from being called with garbage and surfacing a Postgres
  // error to the public.
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) {
    return null
  }

  const { data: teamRows, error: teamErr } = await service
    .rpc('get_public_team_by_token', { token_input: token })

  if (teamErr || !teamRows || teamRows.length === 0) return null

  const team = teamRows[0] as TeamRow

  const [{ data: rosterRows }, { data: scheduleRows }, { data: club }] = await Promise.all([
    service.rpc('get_public_team_roster', { team_id_input: team.team_id }),
    service.rpc('get_public_team_schedule', { team_id_input: team.team_id, days_ahead: 30 }),
    service.from('clubs').select('name').eq('id', team.club_id).single(),
  ])

  return {
    team,
    clubName: (club?.name as string) ?? 'Club',
    roster: (rosterRows ?? []) as RosterRow[],
    schedule: (scheduleRows ?? []) as ScheduleRow[],
  }
}

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params
  const data = await loadShare(token)
  if (!data) return { title: 'Team' }
  return {
    title: `${data.team.team_name} (${data.team.age_group}) — ${data.clubName}`,
    description: `${data.team.team_name} schedule and roster on OffPitchOS.`,
  }
}

// Both take the club's timezone explicitly: this page is public and
// server-rendered, so relying on the runtime's zone would print UTC.
function formatDate(iso: string, timeZone: string) {
  return formatShortDate(iso, timeZone)
}

function formatTime(iso: string, timeZone: string) {
  return fmtTime(iso, timeZone)
}

export default async function PublicTeamPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const data = await loadShare(token)
  if (!data) notFound()

  const { team, clubName, roster, schedule } = data
  const timezone = await getClubTimezoneById(team.club_id)
  // Server component runs once per request — `nowMs` snapshots the
  // boundary between past and upcoming. Eslint's purity rule pushes
  // back on Date.now in render, but a server component IS the render,
  // and there's no "re-render" — capture once into a const.
  const nowMs = new Date().getTime()
  const cutoffMs = nowMs - 12 * 60 * 60 * 1000
  const upcoming = schedule.filter(e => new Date(e.start_time).getTime() >= cutoffMs)
  const past = schedule.filter(e => new Date(e.start_time).getTime() < cutoffMs)

  return (
    <div className="min-h-screen bg-dark text-white">
      <div className="max-w-4xl mx-auto px-6 py-12">
        <header className="border-b border-white/10 pb-8 mb-8">
          <p className="text-sm text-gray uppercase tracking-wide">{clubName}</p>
          <h1 className="text-4xl md:text-5xl font-black tracking-tight mt-2">
            {team.team_name}
          </h1>
          <p className="text-green text-lg font-bold mt-1">{team.age_group}</p>
          <p className="text-gray text-xs mt-3">
            Live page · {roster.length} player{roster.length === 1 ? '' : 's'} · {upcoming.length} upcoming event{upcoming.length === 1 ? '' : 's'}
          </p>
        </header>

        <section className="mb-12">
          <h2 className="text-xl font-bold mb-4">Upcoming</h2>
          {upcoming.length === 0 ? (
            <p className="text-gray text-sm bg-dark-secondary border border-white/5 rounded-xl p-6">
              No upcoming events scheduled.
            </p>
          ) : (
            <div className="space-y-3">
              {upcoming.map(e => {
                const cancelled = e.status === 'cancelled'
                const address = e.event_address || e.venue_address
                const mapsHref = address
                  ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
                  : null
                return (
                  <article
                    key={e.event_id}
                    className={`bg-dark-secondary border border-white/5 rounded-xl p-4 ${cancelled ? 'opacity-50' : ''}`}
                  >
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-xs font-bold bg-green/10 text-green px-2 py-0.5 rounded-full">
                        {EVENT_TYPE_LABELS[e.event_type as EventType] ?? e.event_type}
                      </span>
                      {cancelled && (
                        <span className="text-xs font-bold bg-red/10 text-red px-2 py-0.5 rounded-full">
                          Cancelled
                        </span>
                      )}
                    </div>
                    <p className={`font-bold ${cancelled ? 'line-through text-gray' : 'text-white'}`}>
                      {e.title}
                    </p>
                    <p className="text-gray text-sm">
                      {formatDate(e.start_time, timezone)} · {formatTime(e.start_time, timezone)} – {formatTime(e.end_time, timezone)}
                    </p>
                    {(e.venue_name || address) && (
                      <p className="text-gray text-sm mt-1">
                        {e.venue_name ?? 'Location'}
                        {mapsHref && (
                          <a
                            href={mapsHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="ml-2 text-xs font-bold text-green bg-green/10 hover:bg-green/20 border border-green/20 rounded-full px-2 py-0.5 transition-colors"
                          >
                            Map ↗
                          </a>
                        )}
                      </p>
                    )}
                  </article>
                )
              })}
            </div>
          )}
        </section>

        {past.length > 0 && (
          <section className="mb-12">
            <h2 className="text-xl font-bold mb-4">Recent</h2>
            <div className="space-y-2">
              {past.slice(0, 5).map(e => (
                <article
                  key={e.event_id}
                  className="bg-dark-secondary border border-white/5 rounded-xl p-3 opacity-70"
                >
                  <p className="text-gray text-xs">{formatDate(e.start_time, timezone)}</p>
                  <p className="text-sm font-medium">{e.title}</p>
                </article>
              ))}
            </div>
          </section>
        )}

        <section className="mb-12">
          <h2 className="text-xl font-bold mb-4">Roster</h2>
          {roster.length === 0 ? (
            <p className="text-gray text-sm bg-dark-secondary border border-white/5 rounded-xl p-6">
              Roster not yet posted.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {roster.map(p => (
                <div
                  key={p.player_id}
                  className="bg-dark-secondary border border-white/5 rounded-xl p-3 flex items-center gap-3"
                >
                  {p.jersey_number !== null ? (
                    <div className="w-9 h-9 rounded-full bg-green/10 flex items-center justify-center shrink-0">
                      <span className="text-green font-bold text-sm">{p.jersey_number}</span>
                    </div>
                  ) : (
                    <div className="w-9 h-9 rounded-full bg-white/5 flex items-center justify-center shrink-0">
                      <span className="text-gray font-bold text-xs">{p.first_name.charAt(0)}</span>
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{p.first_name} {p.last_name}</p>
                    {p.player_position && <p className="text-gray text-xs">{p.player_position}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <footer className="pt-8 mt-12 border-t border-white/10 text-center">
          <p className="text-gray text-xs">
            Powered by <a href="https://offpitchos.com" className="text-green font-bold hover:opacity-80">OffPitchOS</a> — the operating system for youth soccer clubs.
          </p>
        </footer>
      </div>
    </div>
  )
}
