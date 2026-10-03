'use client'
import { formatDayKeyShort } from '@/lib/format-datetime'

import { useState, useTransition } from 'react'
import { getAnalyticsData } from './actions'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
  AreaChart, Area,
} from 'recharts'
import { ageGroupLabel } from '@/lib/team-label'

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
}

function formatDate(dateStr: string): string {
  // Calendar date, not an instant — UTC-anchored so server and client agree.
  return formatDayKeyShort(dateStr)
}

interface AnalyticsData {
  overview: {
    totalTeams: number
    totalPlayers: number
    totalCoaches: number
    totalPlayerAccounts: number
  }
  activity: {
    eventsInRange: number
    cancelledInRange: number
    attendanceRate: number | null
    totalAttendance: number
    presentCount: number
  }
  coverage: {
    totalRequests: number
    coverageRate: number
    pendingCoverage: number
  }
  revenue: {
    totalRevenueCents: number
    totalCollectedCents: number
    totalCampRegistrations: number
  }
  teamStats: {
    name: string
    ageGroup: string
    players: number
    eventsLast30: number
    attendanceRate: number
    totalRecords: number
    presentRecords: number
  }[]
  totalFeedback: number
  charts: {
    events: { date: string; scheduled: number; cancelled: number }[]
    attendance: { date: string; present: number; late: number; absent: number }[]
  }
}

const periods = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: 'month', label: 'This month' },
]

const chartTooltipStyle = {
  contentStyle: {
    backgroundColor: '#FFFFFF',
    border: '1px solid rgba(15,21,16,0.1)',
    borderRadius: '8px',
    fontSize: '12px',
    color: '#0F1510',
    boxShadow: '0 4px 16px rgba(15,21,16,0.08)',
  },
  labelStyle: { color: '#5C6660' },
}

export default function AnalyticsClient({ data: initialData }: { data: AnalyticsData }) {
  const [data, setData] = useState(initialData)
  const [period, setPeriod] = useState('30d')
  const [isPending, startTransition] = useTransition()
  const [hoveredTeam, setHoveredTeam] = useState<string | null>(null)

  // Coverage stats are still computed by getAnalyticsData but not shown: a
  // college staff doesn't run substitute-coach requests.
  const { overview, activity, revenue, teamStats, totalFeedback, charts } = data
  // Most programs have no age group on any team; drop the empty column then.
  const showAgeGroup = teamStats.some(t => ageGroupLabel(t.ageGroup))

  function handlePeriodChange(newPeriod: string) {
    setPeriod(newPeriod)
    startTransition(async () => {
      const newData = await getAnalyticsData(newPeriod)
      setData(newData)
    })
  }

  return (
    <div className={`space-y-8 transition-opacity ${isPending ? 'opacity-50' : ''}`}>
      {/* Period Selector */}
      <div className="flex gap-2">
        {periods.map(p => (
          <button
            key={p.value}
            onClick={() => handlePeriodChange(p.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              period === p.value
                ? 'bg-green text-dark'
                : 'bg-dark-secondary border border-white/5 text-gray hover:text-white hover:border-white/20'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Program overview */}
      <section>
        <h2 className="text-lg font-bold text-white mb-4">Program overview</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          <StatCard label="Teams" value={overview.totalTeams} />
          <StatCard label="Players" value={overview.totalPlayers} />
          <StatCard label="Staff" value={overview.totalCoaches} />
          <StatCard label="Player accounts" value={overview.totalPlayerAccounts} />
        </div>
      </section>

      {/* Activity & Attendance */}
      <section>
        <h2 className="text-lg font-bold text-white mb-4">Activity</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 mb-6">
          <StatCard label="Events" value={activity.eventsInRange} />
          <StatCard label="Cancelled" value={activity.cancelledInRange} color={activity.cancelledInRange > 0 ? 'red' : undefined} />
          <StatCard label="Attendance rate" value={activity.attendanceRate === null ? '—' : `${activity.attendanceRate}%`} color="green" />
          <StatCard label="Feedback notes" value={totalFeedback} />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Attendance Chart */}
          <div className="bg-dark-secondary border border-white/5 rounded-xl p-5">
            <h3 className="text-sm font-medium text-gray mb-4">Attendance breakdown</h3>
            {charts.attendance.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={charts.attendance} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,21,16,0.08)" />
                  <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fill: '#5C6660', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#5C6660', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip {...chartTooltipStyle} labelFormatter={(label) => formatDate(String(label))} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="present" stackId="a" fill="#1F4E3D" radius={[0, 0, 0, 0]} name="Present" />
                  <Bar dataKey="late" stackId="a" fill="#D97706" radius={[0, 0, 0, 0]} name="Late" />
                  <Bar dataKey="absent" stackId="a" fill="#C53030" radius={[4, 4, 0, 0]} name="Absent" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-gray text-sm">No attendance taken in this period. Mark attendance on any event in the schedule.</div>
            )}
          </div>

          {/* Events Chart */}
          <div className="bg-dark-secondary border border-white/5 rounded-xl p-5">
            <h3 className="text-sm font-medium text-gray mb-4">Events over time</h3>
            {charts.events.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={charts.events}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(15,21,16,0.08)" />
                  <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fill: '#5C6660', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#5C6660', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip {...chartTooltipStyle} labelFormatter={(label) => formatDate(String(label))} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                  <Area type="monotone" dataKey="scheduled" stroke="#1F4E3D" fill="rgba(31,78,61,0.12)" strokeWidth={2} name="Scheduled" />
                  <Area type="monotone" dataKey="cancelled" stroke="#C53030" fill="rgba(197,48,48,0.08)" strokeWidth={2} name="Cancelled" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-gray text-sm">No events in this period. Add practices and games from the schedule.</div>
            )}
          </div>
        </div>
      </section>

      {/* Revenue — same responsive pattern; currency values are the ones
          most likely to overflow so the StatCard truncate + smaller mobile
          font size carries the rest of the burden. */}
      <section>
        <h2 className="text-lg font-bold text-white mb-4">Camp revenue</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <StatCard label="Camp registrations" value={revenue.totalCampRegistrations} />
          <StatCard label="Expected revenue" value={formatCurrency(revenue.totalRevenueCents)} color="green" />
          <StatCard label="Collected" value={formatCurrency(revenue.totalCollectedCents)} />
        </div>
      </section>

      {/* Team Breakdown */}
      <section>
        <h2 className="text-lg font-bold text-white mb-4">Teams</h2>
        <div className="bg-dark-secondary border border-white/5 rounded-xl overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left text-gray">
                <th className="px-5 py-3 font-medium">Team</th>
                {showAgeGroup && <th className="px-5 py-3 font-medium">Age group</th>}
                <th className="px-5 py-3 font-medium">Players</th>
                <th className="px-5 py-3 font-medium">Events</th>
                <th className="px-5 py-3 font-medium">Activity</th>
              </tr>
            </thead>
            <tbody>
              {teamStats.map(team => {
                const maxEvents = Math.max(...teamStats.map(t => t.eventsLast30), 1)
                const barWidth = Math.round((team.eventsLast30 / maxEvents) * 100)
                const isHovered = hoveredTeam === team.name
                return (
                  <tr key={team.name} className="border-b border-white/5 last:border-0">
                    <td className="px-5 py-3 text-white font-medium">{team.name}</td>
                    {showAgeGroup && <td className="px-5 py-3 text-gray">{ageGroupLabel(team.ageGroup) ?? ''}</td>}
                    <td className="px-5 py-3 text-white">{team.players}</td>
                    <td className="px-5 py-3 text-white">{team.eventsLast30}</td>
                    <td className="px-5 py-3 relative">
                      <div
                        className="cursor-pointer"
                        onMouseEnter={() => setHoveredTeam(team.name)}
                        onMouseLeave={() => setHoveredTeam(null)}
                      >
                        <div className="w-full bg-white/5 rounded-full h-2">
                          <div
                            className="bg-green h-2 rounded-full transition-all"
                            style={{ width: `${barWidth}%` }}
                          />
                        </div>
                        {/* Tooltip */}
                        {isHovered && (
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-dark-secondary border border-white/10 rounded-lg px-4 py-3 text-xs shadow-xl z-10 whitespace-nowrap">
                            <p className="font-bold text-white mb-1">{team.name}</p>
                            <p className="text-gray">Attendance: <span className="text-green font-medium">{team.attendanceRate}%</span></p>
                            <p className="text-gray">Records: {team.presentRecords}/{team.totalRecords} present</p>
                            <p className="text-gray">Events: {team.eventsLast30} in period</p>
                            <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-dark-secondary border-r border-b border-white/10 rotate-45 -mt-1" />
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

function StatCard({ label, value, color }: { label: string; value: string | number; color?: 'green' | 'red' | 'yellow' }) {
  const colorClass = color === 'green' ? 'text-green' : color === 'red' ? 'text-red-400' : color === 'yellow' ? 'text-yellow-400' : 'text-white'

  // Responsive pattern shared with the dashboard home StatCard: shrink
  // padding + font at narrow widths, keep labels on a consistent 2-line
  // min-height for grid alignment, truncate the value as an overflow
  // safety net (currency values like "$6,450.00" are the usual culprit).
  return (
    <div className="bg-dark-secondary border border-white/5 rounded-xl p-4 sm:p-5 min-w-0">
      <p className="text-xs sm:text-sm text-gray mb-1 leading-tight min-h-[2.4em] line-clamp-2">{label}</p>
      <p className={`text-xl sm:text-2xl lg:text-3xl font-black truncate tabular-nums ${colorClass}`}>{value}</p>
    </div>
  )
}
