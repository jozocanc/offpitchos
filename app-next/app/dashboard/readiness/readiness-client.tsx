'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useToast } from '@/components/toast'
import { CHECKIN_STATUS_LABELS, READINESS_LOOKBACK_DAYS, checkinFlags, type CheckinStatus } from '@/lib/checkin'
import {
  addDaysToKey,
  formatDayKeyLong,
  formatDayKeyShort,
  formatDayKeyWeekday,
  formatShortDate,
  formatTime,
} from '@/lib/format-datetime'
import { EVENT_TYPE_LABELS, type EventType } from '@/lib/constants'
import type { Availability, ReadinessData, ReadinessPlayer } from './data'

const STATUS_CHIP: Record<CheckinStatus, string> = {
  fit: 'bg-green/10 text-green',
  limited: 'bg-amber-500/15 text-amber-800',
  out: 'bg-red-500/10 text-red-700',
}

const DOT: Record<CheckinStatus | 'none', string> = {
  fit: 'bg-green',
  limited: 'bg-amber-500',
  out: 'bg-red-600',
  none: 'bg-gray/25',
}

const AVAILABILITY: Record<Availability, { label: string; chip: string }> = {
  available: { label: 'Available', chip: 'bg-green/10 text-green' },
  limited: { label: 'Limited', chip: 'bg-amber-500/15 text-amber-800' },
  out: { label: 'Out', chip: 'bg-red-500/10 text-red-700' },
  unknown: { label: 'Unknown', chip: 'bg-white/5 text-gray' },
}

function playerName(p: Pick<ReadinessPlayer, 'firstName' | 'lastName'>) {
  return `${p.firstName} ${p.lastName}`.trim()
}

function squadLine(p: ReadinessPlayer) {
  return p.jerseyNumber !== null ? `#${p.jerseyNumber} ${playerName(p)}` : playerName(p)
}

function byJersey(a: ReadinessPlayer, b: ReadinessPlayer) {
  const ja = a.jerseyNumber ?? Number.MAX_SAFE_INTEGER
  const jb = b.jerseyNumber ?? Number.MAX_SAFE_INTEGER
  if (ja !== jb) return ja - jb
  return a.lastName.localeCompare(b.lastName)
}

// Flagged first, then not checked in, then limited, then fit.
function rank(p: ReadinessPlayer) {
  if (p.flagged) return 0
  if (!p.checkin) return 1
  if (p.checkin.status === 'limited') return 2
  return 3
}

export default function ReadinessClient({ data }: { data: ReadinessData }) {
  const { toast } = useToast()
  const [openNote, setOpenNote] = useState<string | null>(null)
  const { teams, teamId, today, selectedDate, historyDays, players, nextEvent, timeZone } = data
  const isToday = selectedDate === today

  const href = (params: { team?: string | null; date?: string }) => {
    const q = new URLSearchParams()
    const t = params.team ?? teamId
    if (t && teams.length > 1) q.set('team', t)
    const d = params.date ?? selectedDate
    if (d && d !== today) q.set('date', d)
    const s = q.toString()
    return s ? `/dashboard/readiness?${s}` : '/dashboard/readiness'
  }

  const counts = useMemo(() => {
    const c = { fit: 0, limited: 0, out: 0, none: 0, flagged: 0 }
    for (const p of players) {
      if (!p.checkin) c.none++
      else c[p.checkin.status]++
      if (p.flagged) c.flagged++
    }
    return c
  }, [players])

  const sorted = useMemo(
    () => [...players].sort((a, b) => rank(a) - rank(b) || byJersey(a, b)),
    [players],
  )

  const availability = useMemo(() => {
    const groups: Record<Availability, ReadinessPlayer[]> = { available: [], limited: [], out: [], unknown: [] }
    for (const p of players) groups[p.availability].push(p)
    for (const k of Object.keys(groups) as Availability[]) groups[k].sort(byJersey)
    return groups
  }, [players])

  async function copySquad() {
    const lines = [...availability.available, ...availability.limited].map(squadLine)
    if (lines.length === 0) {
      toast('Nobody is marked available or limited yet.', 'error')
      return
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n'))
      toast(`Copied ${lines.length} player${lines.length === 1 ? '' : 's'}`, 'success')
    } catch {
      toast('Could not copy. Your browser blocked clipboard access.', 'error')
    }
  }

  const dateChips = Array.from({ length: READINESS_LOOKBACK_DAYS + 1 }, (_, i) => addDaysToKey(today, -i))
  const checkedIn = players.length - counts.none

  if (!teamId) {
    return (
      <EmptyCard
        title="No team yet"
        body="Create your team and add the roster, then players can check in every morning."
        action={{ href: '/dashboard/teams', label: 'Go to Teams' }}
      />
    )
  }

  return (
    <div className="space-y-10">
      <div className="space-y-4">
        {/* Team switcher (multi-team programs only) */}
        {teams.length > 1 && (
          <div className="flex flex-wrap gap-2">
            {teams.map(t => (
              <Link
                key={t.id}
                href={href({ team: t.id })}
                className={`text-sm font-bold px-3 py-1.5 rounded-lg border transition-colors ${
                  t.id === teamId ? 'bg-green text-dark-secondary border-green' : 'bg-dark-secondary border-white/10 text-gray hover:text-white'
                }`}
              >
                {t.name}
              </Link>
            ))}
          </div>
        )}

        {/* Date switcher */}
        <div className="-mx-6 px-6 md:mx-0 md:px-0 overflow-x-auto">
          <div className="flex gap-2 w-max">
            {dateChips.map((d, i) => {
              const on = d === selectedDate
              const label = i === 0 ? 'Today' : i === 1 ? 'Yesterday' : `${formatDayKeyWeekday(d)} ${formatDayKeyShort(d).split(' ')[1]}`
              return (
                <Link
                  key={d}
                  href={href({ date: d })}
                  scroll={false}
                  className={`text-xs font-bold px-3 py-2 rounded-full border whitespace-nowrap transition-colors ${
                    on ? 'bg-green text-dark-secondary border-green' : 'bg-dark-secondary border-white/10 text-gray hover:text-white'
                  }`}
                >
                  {label}
                </Link>
              )
            })}
          </div>
        </div>
      </div>

      {/* Summary */}
      <section>
        <div className="flex items-baseline justify-between gap-3 mb-3 flex-wrap">
          <h2 className="text-lg font-bold">{isToday ? 'This morning' : formatDayKeyLong(selectedDate)}</h2>
          <p className="text-xs text-gray tabular-nums">
            {checkedIn} of {players.length} checked in
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <SummaryChip n={counts.fit} label="fit" className="bg-green/10 text-green" />
          <SummaryChip n={counts.limited} label="limited" className="bg-amber-500/15 text-amber-800" />
          <SummaryChip n={counts.out} label="out" className="bg-red-500/10 text-red-700" />
          <SummaryChip n={counts.none} label="not checked in" className="bg-white/5 text-gray" />
          {counts.flagged > 0 && (
            <SummaryChip n={counts.flagged} label="flagged" className="bg-red-600 text-dark-secondary" />
          )}
        </div>
      </section>

      {/* Roster board */}
      <section>
        {players.length === 0 ? (
          <EmptyCard
            title="No players on the roster yet"
            body="Add your roster and invite players with the team code. Their check-ins show up here."
            action={{ href: '/dashboard/teams', label: 'Go to Roster' }}
          />
        ) : (
          <>
            {checkedIn === 0 && (
              <div className="bg-dark-secondary rounded-2xl border border-dashed border-white/15 p-6 text-center mb-4">
                <p className="font-bold">{isToday ? 'No check-ins yet today.' : `No check-ins on ${formatDayKeyLong(selectedDate)}.`}</p>
                <p className="text-gray text-sm mt-1">
                  {isToday ? 'Players get a reminder at 8 AM.' : 'Nobody on the roster checked in that day.'}
                </p>
              </div>
            )}

            <div className="bg-dark-secondary rounded-2xl border border-white/5 overflow-hidden">
              {/* Column headings (desktop) */}
              <div className="hidden md:grid grid-cols-[3rem_1fr_6rem_4rem_4rem_4rem_7rem] gap-3 px-4 py-2.5 border-b border-white/5 text-[11px] uppercase tracking-wider text-gray font-bold">
                <span>#</span>
                <span>Player</span>
                <span>Status</span>
                <span className="text-center">Sleep</span>
                <span className="text-center">Sore</span>
                <span className="text-center">Energy</span>
                <span>Last 7 days</span>
              </div>

              <ul className="divide-y divide-white/5">
                {sorted.map(p => (
                  <PlayerRow
                    key={p.id}
                    p={p}
                    historyDays={historyDays}
                    noteOpen={openNote === p.id}
                    onToggleNote={() => setOpenNote(o => (o === p.id ? null : p.id))}
                  />
                ))}
              </ul>
            </div>
            <p className="text-[11px] text-gray mt-2">
              Flagged: out, soreness 4 or higher, sleep 2 or lower, or energy 2 or lower. Soreness runs 1 (fresh) to 5 (very sore).
            </p>
          </>
        )}
      </section>

      {/* Next game availability */}
      <section>
        <h2 className="text-lg font-bold mb-3">Next game availability</h2>
        {!nextEvent ? (
          <EmptyCard
            title="No game on the schedule"
            body="Add your next game or tournament and this shows who you can pick, from check-ins and RSVPs."
            action={{ href: '/dashboard/schedule', label: 'Open Schedule' }}
          />
        ) : (
          <div className="bg-dark-secondary rounded-2xl border border-white/5 p-4 sm:p-6">
            <div className="flex items-start justify-between gap-4 flex-wrap mb-4">
              <div className="min-w-0">
                <p className="font-bold truncate">{nextEvent.title}</p>
                <p className="text-gray text-xs mt-0.5">
                  {EVENT_TYPE_LABELS[nextEvent.type as EventType] ?? 'Game'} · {formatShortDate(nextEvent.startTime, timeZone)} · {formatTime(nextEvent.startTime, timeZone)}
                </p>
              </div>
              <button
                type="button"
                onClick={copySquad}
                className="text-sm font-bold bg-green text-dark-secondary px-4 py-2.5 rounded-xl hover:opacity-90 transition-opacity"
              >
                Copy squad list
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(['available', 'limited', 'out', 'unknown'] as const).map(k => (
                <div key={k} className="bg-dark rounded-xl border border-white/5 p-3 min-w-0">
                  <div className="flex items-center justify-between mb-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${AVAILABILITY[k].chip}`}>{AVAILABILITY[k].label}</span>
                    <span className="text-xl font-black tabular-nums">{availability[k].length}</span>
                  </div>
                  {availability[k].length > 0 ? (
                    <ul className="space-y-0.5 max-h-48 overflow-y-auto">
                      {availability[k].map(p => (
                        <li key={p.id} className="text-xs text-gray truncate">
                          {p.jerseyNumber !== null && <span className="tabular-nums font-bold text-white">#{p.jerseyNumber} </span>}
                          {playerName(p)}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-xs text-gray/70">None</p>
                  )}
                </div>
              ))}
            </div>
            <p className="text-[11px] text-gray mt-3">
              Combines each player&apos;s latest check-in from the last 2 days with their RSVP. Can&apos;t make it or Out wins; no check-in and no RSVP is Unknown. The copied list holds Available and Limited players.
            </p>
          </div>
        )}
      </section>
    </div>
  )
}

function SummaryChip({ n, label, className }: { n: number; label: string; className: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-bold px-3 py-1.5 rounded-full ${className}`}>
      <span className="tabular-nums">{n}</span>
      <span className="font-medium">{label}</span>
    </span>
  )
}

function Metric({ value, bad }: { value: number | undefined; bad: boolean }) {
  if (value === undefined) return <span className="text-gray/50">-</span>
  return <span className={`tabular-nums font-bold ${bad ? 'text-red-700' : 'text-white'}`}>{value}</span>
}

function HistoryDots({ history, days }: { history: (CheckinStatus | null)[]; days: string[] }) {
  return (
    <div className="flex items-center gap-1" aria-label="Last 7 days">
      {history.map((s, i) => (
        <span
          key={days[i]}
          title={`${formatDayKeyWeekday(days[i])} ${formatDayKeyShort(days[i])}: ${s ? CHECKIN_STATUS_LABELS[s] : 'No check-in'}`}
          className={`w-2.5 h-2.5 rounded-full ${DOT[s ?? 'none']}`}
        />
      ))}
    </div>
  )
}

function PlayerRow({
  p,
  historyDays,
  noteOpen,
  onToggleNote,
}: {
  p: ReadinessPlayer
  historyDays: string[]
  noteOpen: boolean
  onToggleNote: () => void
}) {
  const c = p.checkin
  const flags = c ? checkinFlags(c) : []
  const note = c?.note ?? null

  const statusChip = c ? (
    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_CHIP[c.status]}`}>{CHECKIN_STATUS_LABELS[c.status]}</span>
  ) : (
    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-white/5 text-gray">Not in</span>
  )

  const flagBadge = p.flagged ? (
    <span
      title={flags.join(', ')}
      className="inline-flex items-center gap-1 text-[11px] font-bold text-red-700 bg-red-500/10 px-1.5 py-0.5 rounded"
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M4 22V3h11l1 2h5v11h-7l-1-2H6v8z" /></svg>
      {flags.join(' · ')}
    </span>
  ) : null

  const noteButton = note ? (
    <button
      type="button"
      onClick={onToggleNote}
      title={note}
      aria-expanded={noteOpen}
      className={`inline-flex items-center gap-1 text-[11px] font-bold px-1.5 py-0.5 rounded transition-colors ${
        noteOpen ? 'bg-green text-dark-secondary' : 'bg-green/10 text-green hover:bg-green/20'
      }`}
    >
      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
      Note
    </button>
  ) : null

  return (
    <li className={p.flagged ? 'bg-red-500/[0.04]' : ''}>
      {/* Desktop row */}
      <div className="hidden md:grid grid-cols-[3rem_1fr_6rem_4rem_4rem_4rem_7rem] gap-3 px-4 py-3 items-center">
        <span className="text-sm font-black text-green tabular-nums">{p.jerseyNumber ?? '-'}</span>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium truncate">{playerName(p)}</span>
            {flagBadge}
            {noteButton}
          </div>
          {p.position && <p className="text-[11px] text-gray">{p.position}</p>}
        </div>
        <span>{statusChip}</span>
        <span className="text-center text-sm"><Metric value={c?.sleep} bad={!!c && c.sleep <= 2} /></span>
        <span className="text-center text-sm"><Metric value={c?.soreness} bad={!!c && c.soreness >= 4} /></span>
        <span className="text-center text-sm"><Metric value={c?.energy} bad={!!c && c.energy <= 2} /></span>
        <HistoryDots history={p.history} days={historyDays} />
      </div>

      {/* Mobile row */}
      <div className="md:hidden px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="text-sm font-black text-green tabular-nums w-7 shrink-0">{p.jerseyNumber ?? '-'}</span>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">{playerName(p)}</p>
            {p.position && <p className="text-[11px] text-gray">{p.position}</p>}
          </div>
          {statusChip}
        </div>
        <div className="flex items-center justify-between gap-3 mt-2 pl-10">
          <p className="text-xs text-gray">
            S <Metric value={c?.sleep} bad={!!c && c.sleep <= 2} /> · Sore <Metric value={c?.soreness} bad={!!c && c.soreness >= 4} /> · E <Metric value={c?.energy} bad={!!c && c.energy <= 2} />
          </p>
          <HistoryDots history={p.history} days={historyDays} />
        </div>
        {(flagBadge || noteButton) && <div className="flex flex-wrap gap-1.5 mt-2 pl-10">{flagBadge}{noteButton}</div>}
      </div>

      {noteOpen && note && (
        <div className="px-4 pb-3 md:pl-[4.75rem] pl-14">
          <p className="text-sm text-white bg-dark rounded-lg border border-white/5 px-3 py-2">&ldquo;{note}&rdquo;</p>
        </div>
      )}
    </li>
  )
}

function EmptyCard({ title, body, action }: { title: string; body: string; action?: { href: string; label: string } }) {
  return (
    <div className="bg-dark-secondary rounded-2xl border border-dashed border-white/15 p-8 text-center">
      <p className="font-bold">{title}</p>
      <p className="text-gray text-sm mt-1 max-w-md mx-auto">{body}</p>
      {action && (
        <Link href={action.href} className="inline-block mt-4 text-sm font-bold text-green hover:opacity-80">
          {action.label}
        </Link>
      )}
    </div>
  )
}
