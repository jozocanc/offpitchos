'use client'

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
}

interface AnalyticsData {
  overview: {
    totalTeams: number
    totalPlayers: number
    totalCoaches: number
    totalParents: number
  }
  activity: {
    eventsThisMonth: number
    cancelledThisMonth: number
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
  }[]
  totalFeedback: number
}

export default function AnalyticsClient({ data }: { data: AnalyticsData }) {
  const { overview, activity, coverage, revenue, teamStats, totalFeedback } = data

  return (
    <div className="space-y-8">
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
        <h2 className="text-lg font-bold text-white mb-4">Activity (This Month)</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Events Scheduled" value={activity.eventsThisMonth} />
          <StatCard label="Cancelled" value={activity.cancelledThisMonth} color={activity.cancelledThisMonth > 0 ? 'red' : undefined} />
          <StatCard label="Attendance Rate" value={`${activity.attendanceRate}%`} color="green" />
          <StatCard label="Player Feedback" value={totalFeedback} />
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
                <th className="px-5 py-3 font-medium">Events (30d)</th>
                <th className="px-5 py-3 font-medium">Activity</th>
              </tr>
            </thead>
            <tbody>
              {teamStats.map(team => {
                const maxEvents = Math.max(...teamStats.map(t => t.eventsLast30), 1)
                const barWidth = Math.round((team.eventsLast30 / maxEvents) * 100)
                return (
                  <tr key={team.name} className="border-b border-white/5 last:border-0">
                    <td className="px-5 py-3 text-white font-medium">{team.name}</td>
                    <td className="px-5 py-3 text-gray">{team.ageGroup}</td>
                    <td className="px-5 py-3 text-white">{team.players}</td>
                    <td className="px-5 py-3 text-white">{team.eventsLast30}</td>
                    <td className="px-5 py-3">
                      <div className="w-full bg-white/5 rounded-full h-2">
                        <div
                          className="bg-green h-2 rounded-full transition-all"
                          style={{ width: `${barWidth}%` }}
                        />
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
