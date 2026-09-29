'use client'

import { useMemo, useState } from 'react'
import { useClubTimezone } from '@/components/club-timezone'
import {
  addDaysToKey, dayKey, formatDayKeyWeekday, formatMonthDay,
  formatMonthDayYear, formatTime, mondayOfKey, zonedParts,
} from '@/lib/format-datetime'
import { teamLabel } from '@/lib/team-label'

interface Event {
  id: string
  team_id: string
  type: string
  title: string
  start_time: string
  end_time: string
  status: string
  teams: { name: string; age_group: string }[] | null
  venues: { name: string }[] | null
  travel_depart_at?: string | null
}

interface CalendarViewProps {
  events: Event[]
  onEdit: (eventId: string) => void
  onAddAtDate: (date: string) => void
  /** Whether already-finished events are loaded. They are fetched lazily, so
   *  without them a week in progress only holds the part that is still to come. */
  includesPast?: boolean
}

type Mode = 'month' | 'week'

// Week view hour rows. Tall enough to read a title and a time inside a
// 90-minute block; the visible range shrinks to the hours the week actually
// uses, so the height is spent on events rather than empty mornings.
const HOUR_ROW_PX = 52

export default function CalendarView({ events, onEdit, onAddAtDate, includesPast = false }: CalendarViewProps) {
  const timezone = useClubTimezone()
  // The grid works in "YYYY-MM-DD" key space rather than Date objects:
  // getDay()/getHours() resolve against the RUNTIME's zone, which is UTC on the
  // server, so keys plus zonedParts() are the only way both sides agree.
  const todayKey = dayKey(new Date(), timezone)
  const [mode, setMode] = useState<Mode>('month')
  const [weekStart, setWeekStart] = useState(() => mondayOfKey(todayKey))
  const [monthKey, setMonthKey] = useState(() => todayKey.slice(0, 7)) // "YYYY-MM"

  // Events bucketed by the team's calendar day, sorted by start.
  const byDay = useMemo(() => {
    const map = new Map<string, Event[]>()
    for (const e of events) {
      const k = dayKey(new Date(e.start_time), timezone)
      const list = map.get(k) ?? []
      list.push(e)
      map.set(k, list)
    }
    for (const list of map.values()) list.sort((a, b) => a.start_time.localeCompare(b.start_time))
    return map
  }, [events, timezone])

  return (
    <div>
      {mode === 'month' ? (
        <MonthGrid
          monthKey={monthKey}
          todayKey={todayKey}
          byDay={byDay}
          timezone={timezone}
          onPrev={() => setMonthKey(shiftMonth(monthKey, -1))}
          onNext={() => setMonthKey(shiftMonth(monthKey, 1))}
          onToday={() => setMonthKey(todayKey.slice(0, 7))}
          onEdit={onEdit}
          onAddAtDate={onAddAtDate}
          onOpenWeek={day => { setWeekStart(mondayOfKey(day)); setMode('week') }}
          modeSwitch={<ModeSwitch mode={mode} setMode={setMode} />}
        />
      ) : (
        <WeekGrid
          weekStart={weekStart}
          todayKey={todayKey}
          byDay={byDay}
          events={events}
          timezone={timezone}
          includesPast={includesPast}
          onPrev={() => setWeekStart(addDaysToKey(weekStart, -7))}
          onNext={() => setWeekStart(addDaysToKey(weekStart, 7))}
          onToday={() => setWeekStart(mondayOfKey(todayKey))}
          onEdit={onEdit}
          onAddAtDate={onAddAtDate}
          modeSwitch={<ModeSwitch mode={mode} setMode={setMode} />}
        />
      )}
    </div>
  )
}

function ModeSwitch({ mode, setMode }: { mode: Mode; setMode: (m: Mode) => void }) {
  return (
    <div className="flex rounded-lg border border-white/10 overflow-hidden text-xs font-bold">
      {(['month', 'week'] as const).map(m => (
        <button
          key={m}
          onClick={() => setMode(m)}
          className={`px-3 py-1.5 capitalize transition-colors ${mode === m ? 'bg-green text-dark' : 'text-gray hover:text-white'}`}
        >
          {m}
        </button>
      ))}
    </div>
  )
}

function NavHeader({ label, onPrev, onNext, onToday, right }: {
  label: string
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  right?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
      <div className="flex items-center gap-2">
        <button onClick={onPrev} aria-label="Previous" className="text-gray hover:text-white transition-colors text-sm font-bold w-8 h-8 rounded-lg hover:bg-white/5">
          &lt;
        </button>
        <span className="text-base font-bold min-w-[150px] text-center">{label}</span>
        <button onClick={onNext} aria-label="Next" className="text-gray hover:text-white transition-colors text-sm font-bold w-8 h-8 rounded-lg hover:bg-white/5">
          &gt;
        </button>
        <button onClick={onToday} className="ml-1 text-green text-sm font-bold hover:opacity-80 transition-opacity">
          Today
        </button>
      </div>
      {right}
    </div>
  )
}

// ---------------------------------------------------------------- Month

function MonthGrid({ monthKey, todayKey, byDay, timezone, onPrev, onNext, onToday, onEdit, onAddAtDate, onOpenWeek, modeSwitch }: {
  monthKey: string
  todayKey: string
  byDay: Map<string, Event[]>
  timezone: string
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onEdit: (id: string) => void
  onAddAtDate: (date: string) => void
  onOpenWeek: (day: string) => void
  modeSwitch: React.ReactNode
}) {
  const first = `${monthKey}-01`
  const gridStart = mondayOfKey(first)
  // Six rows always, so the grid doesn't jump in height between months.
  const cells = Array.from({ length: 42 }, (_, i) => addDaysToKey(gridStart, i))
  const label = new Date(`${first}T00:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  const weekdays = cells.slice(0, 7).map(formatDayKeyWeekday)

  return (
    <div>
      <NavHeader label={label} onPrev={onPrev} onNext={onNext} onToday={onToday} right={modeSwitch} />
      <div className="grid grid-cols-7 text-center text-[11px] font-semibold uppercase tracking-wider text-gray mb-1">
        {weekdays.map(w => <div key={w} className="py-1">{w}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-px bg-white/5 rounded-xl overflow-hidden border border-white/5">
        {cells.map(day => {
          const inMonth = day.startsWith(monthKey)
          const isToday = day === todayKey
          const list = byDay.get(day) ?? []
          const shown = list.slice(0, 3)
          return (
            <div
              key={day}
              onClick={() => onAddAtDate(day)}
              className={`min-h-[104px] p-1.5 flex flex-col gap-1 cursor-pointer transition-colors ${inMonth ? 'bg-dark-secondary hover:bg-white/[0.03]' : 'bg-dark/60'}`}
            >
              <div className="flex justify-end">
                <span className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-green text-dark' : inMonth ? 'text-white' : 'text-gray/50'}`}>
                  {Number(day.slice(8, 10))}
                </span>
              </div>
              {shown.map(e => (
                <button
                  key={e.id}
                  onClick={ev => { ev.stopPropagation(); onEdit(e.id) }}
                  title={`${formatTime(e.start_time, timezone)} ${teamLabel(e.title, e.teams?.[0]?.age_group)}`}
                  className={`w-full text-left rounded-md px-1.5 py-1 text-[11px] leading-tight ${eventColors(e.type, e.status)}`}
                >
                  <span className="font-bold">{shortTime(e.start_time, timezone)}</span>{' '}
                  {/* Clamp instead of breaking mid-word; the full title is in the tooltip. */}
                  <span className="line-clamp-2 [overflow-wrap:normal] [word-break:normal]">{e.title}</span>
                  {e.travel_depart_at && e.status !== 'cancelled' && (
                    <span className="block opacity-80">Bus {shortTime(e.travel_depart_at, timezone)}</span>
                  )}
                </button>
              ))}
              {list.length > shown.length && (
                <button
                  onClick={ev => { ev.stopPropagation(); onOpenWeek(day) }}
                  className="text-[11px] font-semibold text-gray hover:text-white text-left px-1"
                >
                  +{list.length - shown.length} more
                </button>
              )}
            </div>
          )
        })}
      </div>
      <Legend />
    </div>
  )
}

// ---------------------------------------------------------------- Week

function WeekGrid({ weekStart, todayKey, byDay, events, timezone, includesPast, onPrev, onNext, onToday, onEdit, onAddAtDate, modeSwitch }: {
  weekStart: string
  todayKey: string
  byDay: Map<string, Event[]>
  events: Event[]
  timezone: string
  includesPast: boolean
  onPrev: () => void
  onNext: () => void
  onToday: () => void
  onEdit: (id: string) => void
  onAddAtDate: (date: string) => void
  modeSwitch: React.ReactNode
}) {
  const days = Array.from({ length: 7 }, (_, i) => addDaysToKey(weekStart, i))
  const weekEvents = days.flatMap(d => byDay.get(d) ?? [])

  // Show the hours this week actually uses (one hour of air either side),
  // never less than 8 hours so a quiet week doesn't collapse. The old grid
  // was a fixed 6am-8pm, which buried evening games below the fold and
  // dropped anything that started after 8pm.
  const { firstHour, lastHour } = useMemo(() => {
    if (weekEvents.length === 0) return { firstHour: 9, lastHour: 19 }
    let lo = 23, hi = 0
    for (const e of weekEvents) {
      const s = zonedParts(e.start_time, timezone)
      const en = zonedParts(e.end_time, timezone)
      lo = Math.min(lo, s.hour)
      const endHour = en.key === s.key ? (en.minute > 0 ? en.hour + 1 : en.hour) : 24
      hi = Math.max(hi, endHour)
    }
    lo = Math.max(0, lo - 1)
    hi = Math.min(24, hi + 1)
    if (hi - lo < 8) hi = Math.min(24, lo + 8)
    if (hi - lo < 8) lo = Math.max(0, hi - 8)
    return { firstHour: lo, lastHour: hi }
  }, [weekEvents, timezone])
  const hours = Array.from({ length: lastHour - firstHour }, (_, i) => firstHour + i)

  const weekLabel = `${formatMonthDay(`${days[0]}T00:00:00Z`, 'UTC')} – ${formatMonthDayYear(`${days[6]}T00:00:00Z`, 'UTC')}`

  // Scheduled load for the week on screen. Cancelled events don't count: the
  // question is how much is actually being asked of the players.
  const weekLoad = useMemo(() => {
    const inWeek = new Set(days)
    let ms = 0, sessions = 0
    for (const e of events) {
      if (e.status === 'cancelled') continue
      if (!inWeek.has(dayKey(new Date(e.start_time), timezone))) continue
      const duration = new Date(e.end_time).getTime() - new Date(e.start_time).getTime()
      if (duration <= 0) continue
      ms += duration
      sessions++
    }
    return { hours: ms / 3_600_000, sessions }
  }, [events, days, timezone])
  const hoursLabel = weekLoad.hours % 1 === 0 ? String(weekLoad.hours) : weekLoad.hours.toFixed(1)
  const isPartialWeek = !includesPast && days.some(d => d < todayKey)

  return (
    <div>
      <NavHeader
        label={weekLabel}
        onPrev={onPrev}
        onNext={onNext}
        onToday={onToday}
        right={
          <div className="flex items-center gap-2">
            {weekLoad.sessions > 0 && (
              <span
                title={`${hoursLabel} scheduled hours across ${weekLoad.sessions} session${weekLoad.sessions === 1 ? '' : 's'}${isPartialWeek ? ' still to come this week. Turn on Show Past to count the whole week.' : ' this week.'} Cancelled events are not counted.`}
                className="text-xs font-bold bg-green/10 text-green px-2.5 py-1 rounded-full whitespace-nowrap"
              >
                {hoursLabel} hrs{isPartialWeek ? ' left' : ''} · {weekLoad.sessions} session{weekLoad.sessions === 1 ? '' : 's'}
              </span>
            )}
            {modeSwitch}
          </div>
        }
      />

      <div className="overflow-x-auto">
        <div className="min-w-[560px]">
          <div className="grid grid-cols-[48px_repeat(7,1fr)] border-b border-white/5 pb-2 mb-1">
            <div />
            {days.map(day => {
              const isToday = day === todayKey
              return (
                <div key={day} className={`text-center text-xs ${isToday ? 'text-green font-bold' : 'text-gray font-medium'}`}>
                  <div className="uppercase tracking-wider">{formatDayKeyWeekday(day)}</div>
                  <div className={`text-lg leading-tight ${isToday ? 'text-green' : 'text-white'}`}>{Number(day.slice(8, 10))}</div>
                </div>
              )
            })}
          </div>

          <div className="grid grid-cols-[48px_repeat(7,1fr)]">
            {/* Hour labels */}
            <div>
              {hours.map(h => (
                <div key={h} style={{ height: HOUR_ROW_PX }} className="text-[11px] text-gray pr-2 text-right -mt-1.5">
                  {hourLabel(h)}
                </div>
              ))}
            </div>
            {/* One positioned column per day, so blocks can span hours. */}
            {days.map(day => (
              <div
                key={day}
                className="relative border-l border-white/5 cursor-pointer hover:bg-white/[0.015]"
                style={{ height: hours.length * HOUR_ROW_PX }}
                onClick={() => onAddAtDate(day)}
              >
                {hours.map((h, i) => (
                  <div key={h} className="absolute left-0 right-0 border-t border-white/5" style={{ top: i * HOUR_ROW_PX }} />
                ))}
                {(byDay.get(day) ?? []).map(e => {
                  const s = zonedParts(e.start_time, timezone)
                  const top = ((s.hour - firstHour) + s.minute / 60) * HOUR_ROW_PX
                  const durH = Math.max(0.5, (new Date(e.end_time).getTime() - new Date(e.start_time).getTime()) / 3_600_000)
                  const height = Math.max(28, durH * HOUR_ROW_PX - 2)
                  return (
                    <button
                      key={e.id}
                      onClick={ev => { ev.stopPropagation(); onEdit(e.id) }}
                      title={teamLabel(e.title, e.teams?.[0]?.age_group)}
                      className={`absolute left-0.5 right-0.5 rounded-md px-1.5 py-1 text-left overflow-hidden text-[11px] leading-tight ${eventColors(e.type, e.status)}`}
                      style={{ top: Math.max(0, top) + 1, height }}
                    >
                      <span className="block font-bold">{e.title}</span>
                      <span className="block opacity-80">{formatTime(e.start_time, timezone)}</span>
                      {e.travel_depart_at && e.status !== 'cancelled' && height > 56 && (
                        <span className="block opacity-80">Bus {shortTime(e.travel_depart_at, timezone)}</span>
                      )}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
      <Legend />
    </div>
  )
}

// ---------------------------------------------------------------- helpers

function Legend() {
  const items: [string, string][] = [['practice', 'Training'], ['game', 'Game'], ['tournament', 'Tournament']]
  return (
    <div className="flex items-center gap-4 mt-3 text-[11px] text-gray">
      {items.map(([type, label]) => (
        <span key={type} className="flex items-center gap-1.5">
          <span className={`w-2.5 h-2.5 rounded-sm ${eventColors(type, 'scheduled').split(' ')[0]}`} />
          {label}
        </span>
      ))}
    </div>
  )
}

function shiftMonth(monthKey: string, delta: number): string {
  const [y, m] = monthKey.split('-').map(Number)
  const d = new Date(Date.UTC(y, m - 1 + delta, 1))
  return d.toISOString().slice(0, 7)
}

function hourLabel(h: number): string {
  if (h === 0 || h === 24) return '12 AM'
  if (h < 12) return `${h} AM`
  if (h === 12) return '12 PM'
  return `${h - 12} PM`
}

/** "7p", "3:30p": compact enough for a month cell. */
function shortTime(iso: string, timeZone: string): string {
  const p = zonedParts(iso, timeZone)
  const h12 = p.hour % 12 === 0 ? 12 : p.hour % 12
  const suffix = p.hour < 12 ? 'a' : 'p'
  return p.minute === 0 ? `${h12}${suffix}` : `${h12}:${String(p.minute).padStart(2, '0')}${suffix}`
}

function eventColors(type: string, status: string): string {
  // The dashboard theme is light (cream page, white cards), so text uses the
  // deep end of each hue to stay readable on its tint.
  if (status === 'cancelled') return 'bg-red-500/10 text-red-700 line-through'
  switch (type) {
    case 'game': return 'bg-blue-600/15 text-blue-800 hover:bg-blue-600/25'
    case 'tournament': return 'bg-purple-600/15 text-purple-800 hover:bg-purple-600/25'
    case 'camp': return 'bg-orange-500/15 text-orange-800 hover:bg-orange-500/25'
    case 'tryout': return 'bg-amber-500/15 text-amber-800 hover:bg-amber-500/25'
    case 'meeting': return 'bg-stone-500/15 text-stone-700 hover:bg-stone-500/25'
    case 'practice':
    default: return 'bg-green/15 text-green hover:bg-green/25'
  }
}
