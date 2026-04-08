'use client'

import { useState } from 'react'
import { EVENT_TYPE_LABELS, type EventType } from '@/lib/constants'

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

export default function CalendarView({ events, onEdit, onAddAtDate }: CalendarViewProps) {
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()))

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })

  const hours = Array.from({ length: 15 }, (_, i) => i + 6) // 6am to 8pm

  function prevWeek() {
    const d = new Date(weekStart)
    d.setDate(d.getDate() - 7)
    setWeekStart(d)
  }

  function nextWeek() {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + 7)
    setWeekStart(d)
  }

  function goToday() {
    setWeekStart(getMonday(new Date()))
  }

  const weekLabel = `${days[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${days[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

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
              const isToday = isSameDay(day, new Date())
              return (
                <div
                  key={day.toISOString()}
                  className={`text-center text-sm ${isToday ? 'text-green font-bold' : 'text-gray font-medium'}`}
                >
                  <div>{day.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                  <div className={`text-lg ${isToday ? 'text-green' : 'text-white'}`}>
                    {day.getDate()}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Hour rows */}
          <div className="relative">
            {hours.map(hour => (
              <div key={hour} className="grid grid-cols-[60px_repeat(7,1fr)] h-16 border-b border-white/5">
                <div className="text-xs text-gray pr-2 text-right pt-1">
                  {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
                </div>
                {days.map(day => (
                  <div
                    key={`${day.toISOString()}-${hour}`}
                    className="border-l border-white/5 relative cursor-pointer hover:bg-white/[0.02] transition-colors"
                    onClick={() => onAddAtDate(day.toISOString().split('T')[0])}
                  >
                    {getEventsForSlot(events, day, hour).map(event => {
                      const colors = getEventColors(event.type, event.status)
                      return (
                        <button
                          key={event.id}
                          onClick={e => { e.stopPropagation(); onEdit(event.id) }}
                          className={`absolute left-0.5 right-0.5 rounded px-1.5 py-0.5 text-xs font-medium truncate text-left ${colors} transition-colors`}
                          style={{
                            top: `${(new Date(event.start_time).getMinutes() / 60) * 100}%`,
                            height: `${Math.max(25, getEventDurationPercent(event) * 64)}px`,
                          }}
                          title={`${event.title} — ${event.teams?.[0]?.age_group}`}
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

function getMonday(date: Date): Date {
  const d = new Date(date)
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  d.setDate(diff)
  d.setHours(0, 0, 0, 0)
  return d
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function getEventsForSlot(events: Event[], day: Date, hour: number): Event[] {
  return events.filter(event => {
    const start = new Date(event.start_time)
    return isSameDay(start, day) && start.getHours() === hour
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
