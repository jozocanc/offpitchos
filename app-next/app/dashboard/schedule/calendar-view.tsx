'use client'

import { useState } from 'react'
import { EVENT_TYPE_LABELS, type EventType } from '@/lib/constants'
import { useClubTimezone } from '@/components/club-timezone'
import {
  addDaysToKey, dayKey, formatDayKeyWeekday, formatMonthDay,
  formatMonthDayYear, mondayOfKey, zonedParts,
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
}

interface CalendarViewProps {
  events: Event[]
  onEdit: (eventId: string) => void
  onAddAtDate: (date: string) => void
}

// Hour-row height in px. Kept compact so the full 6am-8pm week grid fits
// on screen without scrolling. Event block heights are derived from this
// same value so they stay proportional if it changes.
const HOUR_ROW_PX = 30

export default function CalendarView({ events, onEdit, onAddAtDate }: CalendarViewProps) {
  const timezone = useClubTimezone()
  // The whole grid works in "YYYY-MM-DD" key space rather than Date objects.
  // getDay()/getDate()/getHours() all resolve against the RUNTIME's zone, which
  // is UTC on the server, so a 22:00Z session was placed in hour row 22 (not
  // even rendered — the grid is 6am-8pm) on the server and hour row 18 in the
  // browser. Keys plus zonedParts() give the same answer on both sides.
  const todayKey = dayKey(new Date(), timezone)
  const [weekStart, setWeekStart] = useState(() => mondayOfKey(todayKey))

  const days = Array.from({ length: 7 }, (_, i) => addDaysToKey(weekStart, i))

  const hours = Array.from({ length: 15 }, (_, i) => i + 6) // 6am to 8pm

  function prevWeek() { setWeekStart(addDaysToKey(weekStart, -7)) }
  function nextWeek() { setWeekStart(addDaysToKey(weekStart, 7)) }
  function goToday() { setWeekStart(mondayOfKey(todayKey)) }

  const weekLabel = `${formatMonthDay(`${days[0]}T00:00:00Z`, 'UTC')} – ${formatMonthDayYear(`${days[6]}T00:00:00Z`, 'UTC')}`

  return (
    <div>
      {/* Week navigation */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button onClick={prevWeek} className="text-gray hover:text-white transition-colors text-sm font-bold px-2 py-1">
            &lt;
          </button>
          <span className="text-sm font-bold min-w-[200px] text-center">{weekLabel}</span>
          <button onClick={nextWeek} className="text-gray hover:text-white transition-colors text-sm font-bold px-2 py-1">
            &gt;
          </button>
        </div>
        <button onClick={goToday} className="text-green text-sm font-bold hover:opacity-80 transition-opacity">
          Today
        </button>
      </div>

      {/* Grid */}
      <div className="overflow-x-auto">
        <div className="min-w-[700px]">
          {/* Day headers */}
          <div className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-white/5 pb-2 mb-2">
            <div />
            {days.map(day => {
              const isToday = day === todayKey
              return (
                <div
                  key={day}
                  className={`text-center text-sm ${isToday ? 'text-green font-bold' : 'text-gray font-medium'}`}
                >
                  <div>{formatDayKeyWeekday(day)}</div>
                  <div className={`text-lg ${isToday ? 'text-green' : 'text-white'}`}>
                    {Number(day.slice(8, 10))}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Hour rows */}
          <div className="relative">
            {hours.map(hour => (
              <div key={hour} style={{ height: HOUR_ROW_PX }} className="grid grid-cols-[60px_repeat(7,1fr)] border-b border-white/5">
                <div className="text-xs text-gray pr-2 text-right pt-1">
                  {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
                </div>
                {days.map(day => (
                  <div
                    key={`${day}-${hour}`}
                    className="border-l border-white/5 relative cursor-pointer hover:bg-white/[0.02] transition-colors"
                    onClick={() => onAddAtDate(day)}
                  >
                    {getEventsForSlot(events, day, hour, timezone).map(event => {
                      const colors = getEventColors(event.type, event.status)
                      return (
                        <button
                          key={event.id}
                          onClick={e => { e.stopPropagation(); onEdit(event.id) }}
                          className={`absolute left-0.5 right-0.5 rounded px-1.5 py-0.5 text-xs font-medium truncate text-left ${colors} transition-colors`}
                          style={{
                            top: `${(zonedParts(event.start_time, timezone).minute / 60) * 100}%`,
                            height: `${Math.max(22, getEventDurationPercent(event) * HOUR_ROW_PX)}px`,
                          }}
                          title={teamLabel(event.title, event.teams?.[0]?.age_group)}
                        >
                          {event.title}
                        </button>
                      )
                    })}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function getEventsForSlot(events: Event[], day: string, hour: number, timeZone: string): Event[] {
  return events.filter(event => {
    const p = zonedParts(event.start_time, timeZone)
    return p.key === day && p.hour === hour
  })
}

function getEventColors(type: string, status: string): string {
  if (status === 'cancelled') return 'bg-red/20 text-red line-through'
  switch (type) {
    case 'game': return 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
    case 'tournament': return 'bg-purple-500/20 text-purple-400 hover:bg-purple-500/30'
    case 'camp': return 'bg-orange-500/20 text-orange-400 hover:bg-orange-500/30'
    case 'tryout': return 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30'
    case 'meeting': return 'bg-gray-500/20 text-gray-400 hover:bg-gray-500/30'
    case 'practice':
    default: return 'bg-green/20 text-green hover:bg-green/30'
  }
}

function getEventDurationPercent(event: Event): number {
  const start = new Date(event.start_time)
  const end = new Date(event.end_time)
  return (end.getTime() - start.getTime()) / (1000 * 60 * 60) // hours
}
