'use client'

import { useState } from 'react'
import { updatePlayerSize } from './actions'

const JERSEY_SIZES = ['YXS', 'YS', 'YM', 'YL', 'YXL', 'AS', 'AM', 'AL', 'AXL', 'AXXL']
const SHORTS_SIZES = ['YXS', 'YS', 'YM', 'YL', 'YXL', 'AS', 'AM', 'AL', 'AXL', 'AXXL']

interface Player {
  id: string
  firstName: string
  lastName: string
  jerseySize: string | null
  shortsSize: string | null
}

interface TeamGearSummary {
  teamId: string
  teamName: string
  ageGroup: string
  playerCount: number
  jerseyBreakdown: Record<string, number>
  shortsBreakdown: Record<string, number>
  missingCount: number
  players: Player[]
}

export default function GearClient({ teams, userRole }: { teams: TeamGearSummary[]; userRole: string }) {
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null)
  const isDoc = userRole === 'doc'

  // Club-wide totals
  const totalPlayers = teams.reduce((sum, t) => sum + t.playerCount, 0)
  const totalMissing = teams.reduce((sum, t) => sum + t.missingCount, 0)

  // Club-wide jersey aggregation
  const clubJerseys: Record<string, number> = {}
  const clubShorts: Record<string, number> = {}
  for (const team of teams) {
    for (const [size, count] of Object.entries(team.jerseyBreakdown)) {
      clubJerseys[size] = (clubJerseys[size] ?? 0) + count
    }
    for (const [size, count] of Object.entries(team.shortsBreakdown)) {
      clubShorts[size] = (clubShorts[size] ?? 0) + count
    }
  }

  return (
    <div>
      {/* Club-wide summary */}
      {isDoc && (
        <div className="mb-8">
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-dark-secondary border border-white/5 rounded-xl p-5">
              <p className="text-sm text-gray mb-1">Total Players</p>
              <p className="text-3xl font-black text-white">{totalPlayers}</p>
            </div>
            <div className="bg-dark-secondary border border-white/5 rounded-xl p-5">
              <p className="text-sm text-gray mb-1">Sizes Submitted</p>
              <p className="text-3xl font-black text-green">{totalPlayers - totalMissing}</p>
            </div>
            <div className="bg-dark-secondary border border-white/5 rounded-xl p-5">
              <p className="text-sm text-gray mb-1">Missing Sizes</p>
              <p className={`text-3xl font-black ${totalMissing > 0 ? 'text-yellow-400' : 'text-white'}`}>{totalMissing}</p>
            </div>
          </div>

          {/* Club-wide size breakdown */}
          <div className="grid grid-cols-2 gap-4 mb-8">
            <SizeBreakdownCard title="Jersey Sizes (Club)" breakdown={clubJerseys} />
            <SizeBreakdownCard title="Shorts Sizes (Club)" breakdown={clubShorts} />
          </div>
        </div>
      )}

      {/* Per-team breakdown */}
      <h2 className="text-lg font-bold text-white mb-4">By Team</h2>
      <div className="space-y-3">
        {teams.map(team => (
          <div key={team.teamId} className="bg-dark-secondary border border-white/5 rounded-xl">
            <button
              onClick={() => setExpandedTeam(expandedTeam === team.teamId ? null : team.teamId)}
              className="w-full flex items-center justify-between p-5 text-left"
            >
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-white">{team.teamName}</h3>
                  <span className="text-xs bg-green/10 text-green px-2 py-0.5 rounded">{team.ageGroup}</span>
                </div>
                <p className="text-sm text-gray mt-1">
                  {team.playerCount} players &middot; {team.missingCount > 0 ? `${team.missingCount} missing sizes` : 'All sizes in'}
                </p>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                className={`text-gray transition-transform ${expandedTeam === team.teamId ? 'rotate-180' : ''}`}>
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            {expandedTeam === team.teamId && (
              <div className="px-5 pb-5 border-t border-white/5 pt-4">
                {/* Size breakdowns */}
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <SizeBreakdownCard title="Jerseys" breakdown={team.jerseyBreakdown} />
                  <SizeBreakdownCard title="Shorts" breakdown={team.shortsBreakdown} />
                </div>

                {/* Player list with sizes */}
                {isDoc && (
                  <div className="space-y-2">
                    <p className="text-xs text-gray font-semibold uppercase tracking-wide mb-2">Players</p>
                    {team.players.map(player => (
                      <PlayerSizeRow key={player.id} player={player} isDoc={isDoc} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function SizeBreakdownCard({ title, breakdown }: { title: string; breakdown: Record<string, number> }) {
  const sorted = Object.entries(breakdown).sort((a, b) => {
    const order = JERSEY_SIZES
    return order.indexOf(a[0]) - order.indexOf(b[0])
  })

  return (
    <div className="bg-dark rounded-lg p-3">
      <p className="text-xs text-gray font-semibold mb-2">{title}</p>
      {sorted.length === 0 ? (
        <p className="text-xs text-gray">No data yet</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {sorted.map(([size, count]) => (
            <span key={size} className="text-xs bg-white/5 border border-white/10 rounded px-2 py-1 text-white">
              {size}: <span className="font-bold text-green">{count}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function PlayerSizeRow({ player, isDoc }: { player: Player; isDoc: boolean }) {
  const [jerseySize, setJerseySize] = useState(player.jerseySize ?? '')
  const [shortsSize, setShortsSize] = useState(player.shortsSize ?? '')
  const [saving, setSaving] = useState(false)

  const hasChanges = jerseySize !== (player.jerseySize ?? '') || shortsSize !== (player.shortsSize ?? '')

  async function handleSave() {
    setSaving(true)
    try {
      await updatePlayerSize(player.id, jerseySize || null, shortsSize || null)
    } catch {}
    setSaving(false)
  }

  return (
    <div className="flex items-center gap-3 bg-dark/50 rounded-lg px-3 py-2">
      <span className="text-sm text-white flex-1">{player.firstName} {player.lastName}</span>
      <select
        value={jerseySize}
        onChange={e => setJerseySize(e.target.value)}
        className="bg-dark border border-white/10 rounded px-2 py-1 text-xs text-white appearance-none"
      >
        <option value="">Jersey</option>
        {JERSEY_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <select
        value={shortsSize}
        onChange={e => setShortsSize(e.target.value)}
        className="bg-dark border border-white/10 rounded px-2 py-1 text-xs text-white appearance-none"
      >
        <option value="">Shorts</option>
        {SHORTS_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      {hasChanges && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="text-xs bg-green text-dark font-semibold px-2 py-1 rounded hover:opacity-90 disabled:opacity-50"
        >
          {saving ? '...' : 'Save'}
        </button>
      )}
    </div>
  )
}
