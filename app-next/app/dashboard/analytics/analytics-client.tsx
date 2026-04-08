'use client'

import { useState, useTransition } from 'react'
import { getAnalyticsData } from './actions'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend,
  AreaChart, Area,
} from 'recharts'

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

interface AnalyticsData {
  overview: {
    totalTeams: number
    totalPlayers: number
    totalCoaches: number
    totalParents: number
  }
  activity: {
    eventsInRange: number
    cancelledInRange: number
    attendanceRate: number
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
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: '90d', label: '90 Days' },
  { value: 'month', label: 'This Month' },
]

const chartTooltipStyle = {
  contentStyle: {
    backgroundColor: '#1a1a2e',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: '8px',
    fontSize: '12px',
    color: '#fff',
  },
  labelStyle: { color: '#888' },
}

export default function AnalyticsClient({ data: initialData }: { data: AnalyticsData }) {
  const [data, setData] = useState(initialData)
  const [period, setPeriod] = useState('30d')
  const [isPending, startTransition] = useTransition()
  const [hoveredTeam, setHoveredTeam] = useState<string | null>(null)

  const { overview, activity, coverage, revenue, teamStats, totalFeedback, charts } = data

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
                ? 'bg-green text-black'
                : 'bg-dark-secondary border border-white/5 text-gray hover:text-white hover:border-white/20'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Club Overview */}
      <section>
        <h2 className="text-lg font-bold text-white mb-4">Club Overview</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Teams" value={overview.totalTeams} />
          <StatCard label="Players" value={overview.totalPlayers} />
          <StatCard label="Coaches" value={overview.totalCoaches} />
          <StatCard label="Parents" value={overview.totalParents} />
        </div>
      </section>

      {/* Activity & Attendance */}
      <section>
        <h2 className="text-lg font-bold text-white mb-4">Activity</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard label="Events" value={activity.eventsInRange} />
          <StatCard label="Cancelled" value={activity.cancelledInRange} color={activity.cancelledInRange > 0 ? 'red' : undefined} />
          <StatCard label="Attendance Rate" value={`${activity.attendanceRate}%`} color="green" />
          <StatCard label="Player Feedback" value={totalFeedback} />
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Attendance Chart */}
          <div className="bg-dark-secondary border border-white/5 rounded-xl p-5">
            <h3 className="text-sm font-medium text-gray mb-4">Attendance Breakdown</h3>
            {charts.attendance.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={charts.attendance} barCategoryGap="20%">
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fill: '#666', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#666', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip {...chartTooltipStyle} labelFormatter={(label) => formatDate(String(label))} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                  <Bar dataKey="present" stackId="a" fill="#00ff87" radius={[0, 0, 0, 0]} name="Present" />
                  <Bar dataKey="late" stackId="a" fill="#fbbf24" radius={[0, 0, 0, 0]} name="Late" />
                  <Bar dataKey="absent" stackId="a" fill="#f87171" radius={[4, 4, 0, 0]} name="Absent" />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-gray text-sm">No attendance data for this period.</div>
            )}
          </div>

          {/* Events Chart */}
          <div className="bg-dark-secondary border border-white/5 rounded-xl p-5">
            <h3 className="text-sm font-medium text-gray mb-4">Events Over Time</h3>
            {charts.events.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={charts.events}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" tickFormatter={formatDate} tick={{ fill: '#666', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: '#666', fontSize: 11 }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <Tooltip {...chartTooltipStyle} labelFormatter={(label) => formatDate(String(label))} />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: '12px' }} />
                  <Area type="monotone" dataKey="scheduled" stroke="#00ff87" fill="rgba(0,255,135,0.1)" strokeWidth={2} name="Scheduled" />
                  <Area type="monotone" dataKey="cancelled" stroke="#f87171" fill="rgba(248,113,113,0.1)" strokeWidth={2} name="Cancelled" />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[220px] flex items-center justify-center text-gray text-sm">No events for this period.</div>
            )}
          </div>
        </div>
      </section>

      {/* Coverage */}
      <section>
        <h2 className="text-lg font-bold text-white mb-4">Coach Coverage</h2>
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Coverage Requests" value={coverage.totalRequests} />
          <StatCard label="Fill Rate" value={`${coverage.coverageRate}%`} color="green" />
          <StatCard label="Pending" value={coverage.pendingCoverage} color={coverage.pendingCoverage > 0 ? 'yellow' : undefined} />
        </div>
      </section>

      {/* Revenue */}
      <section>
        <h2 className="text-lg font-bold text-white mb-4">Camp Revenue</h2>
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Camp Registrations" value={revenue.totalCampRegistrations} />
          <StatCard label="Expected Revenue" value={formatCurrency(revenue.totalRevenueCents)} color="green" />
          <StatCard label="Collected" value={formatCurrency(revenue.totalCollectedCents)} />
        </div>
      </section>

      {/* Team Breakdown */}
      <section>
        <h2 className="text-lg font-bold text-white mb-4">Teams</h2>
        <div className="bg-dark-secondary border border-white/5 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5 text-left text-gray">
                <th className="px-5 py-3 font-medium">Team</th>
                <th className="px-5 py-3 font-medium">Age Group</th>
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
                    <td className="px-5 py-3 text-gray">{team.ageGroup}</td>
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
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-[#1a1a2e] border border-white/10 rounded-lg px-4 py-3 text-xs shadow-xl z-10 whitespace-nowrap">
                            <p className="font-bold text-white mb-1">{team.name}</p>
                            <p className="text-gray">Attendance: <span className="text-green font-medium">{team.attendanceRate}%</span></p>
                            <p className="text-gray">Records: {team.presentRecords}/{team.totalRecords} present</p>
                            <p className="text-gray">Events: {team.eventsLast30} in period</p>
                            <div className="absolute top-full left-1/2 -translate-x-1/2 w-2 h-2 bg-[#1a1a2e] border-r border-b border-white/10 rotate-45 -mt-1" />
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

  return (
    <div className="bg-dark-secondary border border-white/5 rounded-xl p-5">
      <p className="text-sm text-gray mb-1">{label}</p>
      <p className={`text-3xl font-black ${colorClass}`}>{value}</p>
    </div>
  )
}
