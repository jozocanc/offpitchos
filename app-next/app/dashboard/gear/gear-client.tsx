'use client'

import { useState } from 'react'
import { updatePlayerSize, requestMissingSizes } from './actions'
import { useToast } from '@/components/toast'

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

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  const now = Date.now()
  const diffSec = Math.max(0, Math.round((now - then) / 1000))
  if (diffSec < 60) return 'just now'
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `${diffMin} min ago`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  const diffDay = Math.round(diffHr / 24)
  return `${diffDay}d ago`
}

export default function GearClient({
  teams,
  userRole,
  lastRequestedAt,
  lastRequestedParentCount,
  respondedSinceRequest,
}: {
  teams: TeamGearSummary[]
  userRole: string
  lastRequestedAt: string | null
  lastRequestedParentCount: number
  respondedSinceRequest: number
}) {
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null)
  const [requesting, setRequesting] = useState(false)
  const [copied, setCopied] = useState(false)
  const { toast } = useToast()
  const isDoc = userRole === 'doc'

  // Club-wide totals
  const totalPlayers = teams.reduce((sum, t) => sum + t.playerCount, 0)
  const totalMissing = teams.reduce((sum, t) => sum + t.missingCount, 0)
  const completionPct = totalPlayers > 0 ? Math.round(((totalPlayers - totalMissing) / totalPlayers) * 100) : 0

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

  async function handleRequestSizes() {
    if (requesting) return
    setRequesting(true)
    try {
      const result = await requestMissingSizes()
      if (result.alreadyComplete) {
        toast('All sizes already submitted · nothing to request', 'success')
      } else if (result.parentsNotified === 0) {
        toast('No parents with notifications enabled were found', 'error')
      } else {
        toast(`Requested sizes from ${result.parentsNotified} ${result.parentsNotified === 1 ? 'parent' : 'parents'} (${result.kidsNeedingSizes} ${result.kidsNeedingSizes === 1 ? 'kid' : 'kids'})`, 'success')
      }
    } catch (err: any) {
      toast(err?.message ?? 'Failed to request sizes', 'error')
    } finally {
      setRequesting(false)
    }
  }

  function handleCopyOrder() {
    const lines: string[] = []
    const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
    lines.push(`OffPitchOS club gear order — ${today}`)
    lines.push('')

    const sortedSizes = Object.keys({ ...clubJerseys, ...clubShorts })
    const order = ['YXS', 'YS', 'YM', 'YL', 'YXL', 'AS', 'AM', 'AL', 'AXL', 'AXXL']
    sortedSizes.sort((a, b) => order.indexOf(a) - order.indexOf(b))

    const jerseyTotal = Object.values(clubJerseys).reduce((s, n) => s + n, 0)
    lines.push(`JERSEYS (${jerseyTotal} total)`)
    for (const size of order) {
      if (clubJerseys[size]) lines.push(`  ${size} × ${clubJerseys[size]}`)
    }
    lines.push('')

    const shortsTotal = Object.values(clubShorts).reduce((s, n) => s + n, 0)
    lines.push(`SHORTS (${shortsTotal} total)`)
    for (const size of order) {
      if (clubShorts[size]) lines.push(`  ${size} × ${clubShorts[size]}`)
    }

    if (totalMissing > 0) {
      lines.push('')
      lines.push(`⚠ ${totalMissing} player${totalMissing === 1 ? '' : 's'} still missing sizes — not included above.`)
    }

    const text = lines.join('\n')

    try {
      navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast('Order copied to clipboard', 'success')
    } catch {
      toast('Copy failed — try again', 'error')
    }
  }

  return (
    <div>
      {/* DOC action bar */}
      {isDoc && (
        <div className="mb-6">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleRequestSizes}
              disabled={requesting || totalMissing === 0}
              className="bg-green text-dark font-bold px-4 py-2 rounded-xl text-sm hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
              title={totalMissing === 0 ? 'All sizes already submitted' : `Request sizes from parents with ${totalMissing} missing`}
            >
              {requesting ? (
                <>
                  <span className="inline-block w-2 h-2 bg-dark/60 rounded-full animate-pulse" />
                  Sending…
                </>
              ) : (
                <>
                  📨 Request sizes from parents
                  {totalMissing > 0 && <span className="bg-dark/20 text-dark px-1.5 py-0.5 rounded text-[10px] font-bold">{totalMissing}</span>}
                </>
              )}
            </button>
            <button
              onClick={handleCopyOrder}
              disabled={totalPlayers - totalMissing === 0}
              className="bg-white/5 text-white border border-white/10 font-semibold px-4 py-2 rounded-xl text-sm hover:bg-white/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {copied ? '✓ Copied' : '📋 Copy order to clipboard'}
            </button>
          </div>

          {/* Last-request status bar */}
          {lastRequestedAt && (
            <div className="mt-3 bg-dark-secondary border border-white/5 rounded-xl px-4 py-3 flex flex-wrap items-center gap-4 text-sm">
              <span className="text-gray">
                Last requested <span className="text-white font-semibold">{formatRelative(lastRequestedAt)}</span>
              </span>
              {lastRequestedParentCount > 0 && (
                <>
                  <span className="w-px h-4 bg-white/10" />
                  <span className="text-gray">
                    Responses:{' '}
                    <span className={`font-bold ${respondedSinceRequest >= lastRequestedParentCount ? 'text-green' : 'text-yellow-400'}`}>
                      {respondedSinceRequest} of {lastRequestedParentCount}
                    </span>{' '}
                    {respondedSinceRequest === 1 ? 'parent' : 'parents'}
                  </span>
                  <div className="flex-1 min-w-[80px] max-w-[200px] h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        respondedSinceRequest >= lastRequestedParentCount ? 'bg-green' : 'bg-yellow-400'
                      }`}
                      style={{
                        width: `${Math.min(100, Math.round((respondedSinceRequest / lastRequestedParentCount) * 100))}%`,
                      }}
                    />
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* Club-wide summary */}
      {isDoc && (
        <div className="mb-8">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 mb-4">
            <div className="bg-dark-secondary border border-white/5 rounded-xl p-4 sm:p-5 min-w-0">
              <p className="text-xs sm:text-sm text-gray mb-1 leading-tight min-h-[2.4em] line-clamp-2">Total Players</p>
              <p className="text-xl sm:text-2xl lg:text-3xl font-black text-white truncate tabular-nums">{totalPlayers}</p>
            </div>
            <div className="bg-dark-secondary border border-white/5 rounded-xl p-4 sm:p-5 min-w-0">
              <p className="text-xs sm:text-sm text-gray mb-1 leading-tight min-h-[2.4em] line-clamp-2">Sizes Submitted</p>
              <p className="text-xl sm:text-2xl lg:text-3xl font-black text-green truncate tabular-nums">{totalPlayers - totalMissing}</p>
            </div>
            <div className="bg-dark-secondary border border-white/5 rounded-xl p-4 sm:p-5 min-w-0">
              <p className="text-xs sm:text-sm text-gray mb-1 leading-tight min-h-[2.4em] line-clamp-2">Missing Sizes</p>
              <p className={`text-xl sm:text-2xl lg:text-3xl font-black truncate tabular-nums ${totalMissing > 0 ? 'text-yellow-400' : 'text-white'}`}>{totalMissing}</p>
            </div>
          </div>

          {/* Club-wide completion progress */}
          <div className="bg-dark-secondary border border-white/5 rounded-xl p-5 mb-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray font-semibold">Club-wide Completion</p>
              <p className={`text-sm font-bold ${completionPct === 100 ? 'text-green' : completionPct >= 75 ? 'text-white' : 'text-yellow-400'}`}>
                {completionPct}%
              </p>
            </div>
            <div className="h-2 w-full bg-white/5 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${completionPct === 100 ? 'bg-green' : completionPct >= 75 ? 'bg-green/70' : 'bg-yellow-400'}`}
                style={{ width: `${completionPct}%` }}
              />
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
        {teams.map(team => {
          const teamPct = team.playerCount > 0 ? Math.round(((team.playerCount - team.missingCount) / team.playerCount) * 100) : 0
          const isComplete = team.missingCount === 0 && team.playerCount > 0
          return (
          <div key={team.teamId} className="bg-dark-secondary border border-white/5 rounded-xl">
            <button
              onClick={() => setExpandedTeam(expandedTeam === team.teamId ? null : team.teamId)}
              className="w-full flex items-center justify-between p-5 text-left hover:bg-white/[0.02] transition-colors rounded-xl"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-white">{team.teamName}</h3>
                  <span className="text-xs bg-green/10 text-green px-2 py-0.5 rounded">{team.ageGroup}</span>
                  {isComplete && (
                    <span className="text-xs bg-green/15 text-green px-2 py-0.5 rounded font-semibold">✓ Complete</span>
                  )}
                  {team.missingCount > 0 && (
                    <span className="text-xs bg-yellow-400/10 text-yellow-400 px-2 py-0.5 rounded font-semibold">
                      {team.missingCount} missing
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray mt-1">
                  {team.playerCount} players &middot; {teamPct}% sized
                </p>
                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden mt-2 max-w-md">
                  <div
                    className={`h-full rounded-full transition-all ${teamPct === 100 ? 'bg-green' : teamPct >= 75 ? 'bg-green/70' : 'bg-yellow-400'}`}
                    style={{ width: `${teamPct}%` }}
                  />
                </div>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                className={`text-gray transition-transform ml-4 shrink-0 ${expandedTeam === team.teamId ? 'rotate-180' : ''}`}>
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
          )
        })}
      </div>
    </div>
  )
}

function SizeBreakdownCard({ title, breakdown }: { title: string; breakdown: Record<string, number> }) {
  const sorted = Object.entries(breakdown).sort((a, b) => {
    const order = JERSEY_SIZES
    return order.indexOf(a[0]) - order.indexOf(b[0])
  })
  const maxCount = Math.max(0, ...sorted.map(([, c]) => c))

  return (
    <div className="bg-dark rounded-lg p-3">
      <p className="text-xs text-gray font-semibold mb-2">{title}</p>
      {sorted.length === 0 ? (
        <p className="text-xs text-gray">No data yet</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {sorted.map(([size, count]) => {
            const isTop = count === maxCount && maxCount > 0
            return (
              <span
                key={size}
                title={isTop ? 'Most popular size' : undefined}
                className={`text-xs rounded px-2 py-1 border ${isTop ? 'bg-green/15 border-green/30 text-white' : 'bg-white/5 border-white/10 text-white'}`}
              >
                {size}: <span className="font-bold text-green">{count}</span>
              </span>
            )
          })}
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
