'use client'
import { formatMonthDayYear, dayKey, addDaysToKey } from '@/lib/format-datetime'
import { useClubTimezone } from '@/components/club-timezone'

import { useState } from 'react'
import { updatePlayerSize, requestMissingSizes } from './actions'
import { useToast } from '@/components/toast'
import { ageGroupLabel } from '@/lib/team-label'
import { GEAR_SIZES, gearSizeLabel } from '@/lib/constants'

const JERSEY_SIZES: readonly string[] = GEAR_SIZES
const SHORTS_SIZES: readonly string[] = GEAR_SIZES

interface Player {
  id: string
  firstName: string
  lastName: string
  jerseySize: string | null
  shortsSize: string | null
  collectToken: string
  hasTravelId: boolean | null
  passportExpiry: string | null
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
  lastRequestedPlayerCount,
  respondedSinceRequest,
  playersWithAccounts,
}: {
  teams: TeamGearSummary[]
  userRole: string
  lastRequestedAt: string | null
  lastRequestedPlayerCount: number
  respondedSinceRequest: number
  playersWithAccounts: number
}) {
  const timezone = useClubTimezone()
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null)
  const [requesting, setRequesting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copiedLinks, setCopiedLinks] = useState(false)
  const { toast } = useToast()
  const isDoc = userRole === 'doc' || userRole === 'coach'
  // Any player linked to their own login? If not, the in-app request would
  // notify nobody and the collect links become the primary action.
  const hasAccounts = playersWithAccounts > 0

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
      const reqRes = await requestMissingSizes()
      if (!reqRes.ok) { toast(reqRes.error, 'error'); return }
      const result = reqRes.data
      if (result.alreadyComplete) {
        toast('All sizes already submitted · nothing to request', 'success')
      } else if (result.parentsNotified === 0) {
        toast('No players with linked accounts were found. Send the player links instead.', 'error')
      } else if (result.emailFailed >= result.parentsNotified) {
        // Every email failed. Push still went out, so the request is
        // logged and players may still see it on mobile.
        toast(
          `Sizes requested, but emails didn't deliver. Push notifications went out. Tap 'Request sizes' again in a few minutes to retry emails.`,
          'error',
        )
      } else {
        const base = `Requested sizes from ${result.parentsNotified} ${result.parentsNotified === 1 ? 'player' : 'players'}`
        if (result.emailFailed > 0) {
          toast(`${base} · ${result.emailFailed} email${result.emailFailed === 1 ? '' : 's'} failed`, 'error')
        } else {
          toast(base, 'success')
        }
      }
    } catch (err: any) {
      toast(err?.message ?? 'Failed to request sizes', 'error')
    } finally {
      setRequesting(false)
    }
  }

  // Every player gets their own link because the token IS the credential.
  // Staff here run on a WhatsApp group, and we hold no player emails, so the
  // realistic delivery is paste-into-chat rather than a mail fan-out.
  async function handleCopyPlayerLinks() {
    const origin = window.location.origin
    const lines: string[] = []

    for (const team of teams) {
      const needed = team.players.filter(p => !p.jerseySize || !p.shortsSize)
      if (needed.length === 0) continue
      if (teams.length > 1) lines.push(team.teamName)
      for (const p of needed) {
        lines.push(`${p.firstName} ${p.lastName}: ${origin}/collect/${p.collectToken}`)
      }
      lines.push('')
    }

    if (lines.length === 0) {
      toast('Every player has already submitted', 'success')
      return
    }

    try {
      await navigator.clipboard.writeText(lines.join('\n').trim())
      setCopiedLinks(true)
      setTimeout(() => setCopiedLinks(false), 2000)
      toast('Links copied · send each player their own', 'success')
    } catch {
      toast('Copy failed, try again', 'error')
    }
  }

  function handleCopyOrder() {
    const lines: string[] = []
    const today = formatMonthDayYear(new Date(), timezone)
    lines.push(`OffPitchOS team gear order, ${today}`)
    lines.push('')

    const sortedSizes = Object.keys({ ...clubJerseys, ...clubShorts })
    const order: readonly string[] = GEAR_SIZES
    sortedSizes.sort((a, b) => order.indexOf(a) - order.indexOf(b))

    const jerseyTotal = Object.values(clubJerseys).reduce((s, n) => s + n, 0)
    lines.push(`JERSEYS (${jerseyTotal} total)`)
    for (const size of order) {
      if (clubJerseys[size]) lines.push(`  ${gearSizeLabel(size)} × ${clubJerseys[size]}`)
    }
    lines.push('')

    const shortsTotal = Object.values(clubShorts).reduce((s, n) => s + n, 0)
    lines.push(`SHORTS (${shortsTotal} total)`)
    for (const size of order) {
      if (clubShorts[size]) lines.push(`  ${gearSizeLabel(size)} × ${clubShorts[size]}`)
    }

    if (totalMissing > 0) {
      lines.push('')
      lines.push(`⚠ ${totalMissing} player${totalMissing === 1 ? '' : 's'} still missing sizes, not included above.`)
    }

    const text = lines.join('\n')

    try {
      navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
      toast('Order copied to clipboard', 'success')
    } catch {
      toast('Copy failed, try again', 'error')
    }
  }

  return (
    <div>
      {/* DOC action bar */}
      {isDoc && (
        <div className="mb-6">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={handleCopyPlayerLinks}
              disabled={totalMissing === 0}
              className={`${hasAccounts ? 'bg-white/5 text-white border border-white/10 hover:bg-white/10' : 'bg-green text-dark hover:opacity-90'} font-bold px-4 py-2 rounded-xl text-sm transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2`}
              title="Copy one private link per player to send them directly"
            >
              {copiedLinks ? '✓ Copied' : <><span aria-hidden="true">🔗</span>Copy player links</>}
              {totalMissing > 0 && (
                <span className={`${hasAccounts ? 'bg-white/10 text-white' : 'bg-dark/20 text-dark'} px-1.5 py-0.5 rounded text-[10px] font-bold`}>{totalMissing}</span>
              )}
            </button>
            <button
              onClick={handleRequestSizes}
              disabled={requesting || totalMissing === 0 || !hasAccounts}
              className={`${hasAccounts ? 'bg-green text-dark hover:opacity-90' : 'bg-white/5 text-white border border-white/10'} font-bold px-4 py-2 rounded-xl text-sm transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2`}
              title={
                !hasAccounts
                  ? 'No player has joined with their own account yet, so this would notify nobody. Send the player links instead.'
                  : totalMissing === 0
                    ? 'All sizes already submitted'
                    : `Request sizes from players (${totalMissing} missing)`
              }
            >
              {requesting ? (
                <>
                  <span className="inline-block w-2 h-2 bg-dark/60 rounded-full animate-pulse" />
                  Sending…
                </>
              ) : (
                <>
                  <span aria-hidden="true">📨</span>Request sizes from players
                  {totalMissing > 0 && <span className="bg-dark/20 text-dark px-1.5 py-0.5 rounded text-[10px] font-bold">{totalMissing}</span>}
                </>
              )}
            </button>
            <button
              onClick={handleCopyOrder}
              disabled={totalPlayers - totalMissing === 0}
              className="bg-white/5 text-white border border-white/10 font-semibold px-4 py-2 rounded-xl text-sm hover:bg-white/10 transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
            >
              {copied ? '✓ Copied' : <><span aria-hidden="true">📋</span>Copy order to clipboard</>}
            </button>
          </div>

          {/* Last-request status bar */}
          {lastRequestedAt && (
            <div className="mt-3 bg-dark-secondary border border-white/5 rounded-xl px-4 py-3 flex flex-wrap items-center gap-4 text-sm">
              <span className="text-gray">
                Last requested <span className="text-white font-semibold">{formatRelative(lastRequestedAt)}</span>
              </span>
              {lastRequestedPlayerCount > 0 && (
                <>
                  <span className="w-px h-4 bg-white/10" />
                  <span className="text-gray">
                    Responses:{' '}
                    <span className={`font-bold ${respondedSinceRequest >= lastRequestedPlayerCount ? 'text-green' : 'text-yellow-400'}`}>
                      {respondedSinceRequest} of {lastRequestedPlayerCount}
                    </span>{' '}
                    {respondedSinceRequest === 1 ? 'player' : 'players'}
                  </span>
                  <div className="flex-1 min-w-[80px] max-w-[200px] h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        respondedSinceRequest >= lastRequestedPlayerCount ? 'bg-green' : 'bg-yellow-400'
                      }`}
                      style={{
                        width: `${Math.min(100, Math.round((respondedSinceRequest / lastRequestedPlayerCount) * 100))}%`,
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
          <div className="grid grid-cols-3 gap-3 sm:gap-4 mb-4">
            <div className="bg-dark-secondary border border-white/5 rounded-xl p-3 sm:p-5 min-w-0">
              <p className="text-xs sm:text-sm text-gray mb-1 leading-tight min-h-[2.4em] line-clamp-2">Total players</p>
              <p className="text-xl sm:text-2xl lg:text-3xl font-black text-white truncate tabular-nums">{totalPlayers}</p>
            </div>
            <div className="bg-dark-secondary border border-white/5 rounded-xl p-3 sm:p-5 min-w-0">
              <p className="text-xs sm:text-sm text-gray mb-1 leading-tight min-h-[2.4em] line-clamp-2">Sizes submitted</p>
              <p className="text-xl sm:text-2xl lg:text-3xl font-black text-green truncate tabular-nums">{totalPlayers - totalMissing}</p>
            </div>
            <div className="bg-dark-secondary border border-white/5 rounded-xl p-3 sm:p-5 min-w-0">
              <p className="text-xs sm:text-sm text-gray mb-1 leading-tight min-h-[2.4em] line-clamp-2">Missing sizes</p>
              <p className={`text-xl sm:text-2xl lg:text-3xl font-black truncate tabular-nums ${totalMissing > 0 ? 'text-yellow-400' : 'text-white'}`}>{totalMissing}</p>
            </div>
          </div>

          {/* Club-wide completion progress */}
          <div className="bg-dark-secondary border border-white/5 rounded-xl p-5 mb-6">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-gray font-semibold">Program-wide completion</p>
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
            <SizeBreakdownCard title="Jersey sizes (all teams)" breakdown={clubJerseys} onPage />
            <SizeBreakdownCard title="Shorts sizes (all teams)" breakdown={clubShorts} onPage />
          </div>
        </div>
      )}

      {/* Per-team breakdown */}
      <h2 className="text-lg font-bold text-white mb-4">By team</h2>
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
                  {ageGroupLabel(team.ageGroup) && (
                    <span className="text-xs bg-green/10 text-green px-2 py-0.5 rounded">{ageGroupLabel(team.ageGroup)}</span>
                  )}
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
                    <TravelReadinessSummary players={team.players} todayKey={dayKey(new Date(), timezone)} />
                    <p className="text-xs text-gray font-semibold uppercase tracking-wide mb-2">Players</p>
                    {team.players.map(player => (
                      <PlayerSizeRow key={player.id} player={player} isDoc={isDoc} todayKey={dayKey(new Date(), timezone)} />
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

// onPage: sits straight on the cream page (program totals), so it needs the
// white card surface; inside a team card the cream inset reads fine.
function SizeBreakdownCard({ title, breakdown, onPage = false }: { title: string; breakdown: Record<string, number>; onPage?: boolean }) {
  const sorted = Object.entries(breakdown).sort((a, b) => {
    const order = JERSEY_SIZES
    return order.indexOf(a[0]) - order.indexOf(b[0])
  })
  const maxCount = Math.max(0, ...sorted.map(([, c]) => c))

  return (
    <div className={onPage ? 'bg-dark-secondary border border-white/5 rounded-xl p-4' : 'bg-dark rounded-lg p-3'}>
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
                {gearSizeLabel(size)}: <span className="font-bold text-green">{count}</span>
              </span>
            )
          })}
        </div>
      )}
    </div>
  )
}

// Passports expiring within ~6 months are flagged: many countries refuse
// entry inside that window, so "valid today" is not "valid for the trip".
const PASSPORT_WARN_DAYS = 183

function passportStatus(expiry: string | null, todayKey: string): 'none' | 'expired' | 'soon' | 'ok' {
  if (!expiry) return 'none'
  if (expiry < todayKey) return 'expired'
  if (expiry < addDaysToKey(todayKey, PASSPORT_WARN_DAYS)) return 'soon'
  return 'ok'
}

function formatExpiry(key: string): string {
  // Date-only value: anchor at UTC noon and format in UTC so it never shifts a day.
  return formatMonthDayYear(`${key}T12:00:00Z`, 'UTC')
}

function TravelReadinessSummary({ players, todayKey }: { players: Player[]; todayKey: string }) {
  if (players.length === 0) return null
  const withId = players.filter(p => p.hasTravelId === true).length
  const noId = players.filter(p => p.hasTravelId === false).length
  const passports = players.filter(p => p.passportExpiry).length
  const flagged = players.filter(p => {
    const st = passportStatus(p.passportExpiry, todayKey)
    return st === 'expired' || st === 'soon'
  }).length
  return (
    <div className="bg-dark rounded-lg p-3 mb-4">
      <p className="text-xs text-gray font-semibold mb-1.5">Travel readiness</p>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
        <span className="text-white"><span className="font-bold text-green">{withId}</span>/{players.length} confirmed travel ID</span>
        {noId > 0 && <span className="text-red font-semibold">{noId} without ID</span>}
        <span className="text-white">{passports} passport{passports === 1 ? '' : 's'} on file</span>
        {flagged > 0 && <span className="text-yellow-500 font-semibold">{flagged} expired or expiring within 6 months</span>}
      </div>
    </div>
  )
}

function TravelBadges({ player, todayKey }: { player: Player; todayKey: string }) {
  const st = passportStatus(player.passportExpiry, todayKey)
  return (
    <span className="flex items-center gap-1 shrink-0">
      {player.hasTravelId === true && (
        <span title="Has a valid government photo ID for travel" className="text-[10px] font-semibold bg-green/10 text-green border border-green/20 rounded px-1.5 py-0.5">ID</span>
      )}
      {player.hasTravelId === false && (
        <span title="Says they do not have a valid travel ID yet" className="text-[10px] font-semibold bg-red/10 text-red border border-red/20 rounded px-1.5 py-0.5">No ID</span>
      )}
      {st !== 'none' && player.passportExpiry && (
        <span
          title={`Passport expires ${formatExpiry(player.passportExpiry)}`}
          className={`text-[10px] font-semibold rounded px-1.5 py-0.5 border ${
            st === 'expired' ? 'bg-red/10 text-red border-red/20'
              : st === 'soon' ? 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20'
                : 'bg-white/5 text-gray border-white/10'
          }`}
        >
          {st === 'expired' ? 'Passport expired' : `Passport ${formatExpiry(player.passportExpiry)}`}
        </span>
      )}
    </span>
  )
}

function PlayerSizeRow({ player, isDoc, todayKey }: { player: Player; isDoc: boolean; todayKey: string }) {
  const { toast } = useToast()
  const [jerseySize, setJerseySize] = useState(player.jerseySize ?? '')
  const [shortsSize, setShortsSize] = useState(player.shortsSize ?? '')
  const [saving, setSaving] = useState(false)

  const hasChanges = jerseySize !== (player.jerseySize ?? '') || shortsSize !== (player.shortsSize ?? '')

  async function handleSave() {
    setSaving(true)
    try {
      const r = await updatePlayerSize(player.id, jerseySize || null, shortsSize || null)
      if (!r.ok) { toast(r.error, 'error'); return }
    } catch {}
    setSaving(false)
  }

  return (
    <div className="flex items-center gap-3 bg-dark/50 rounded-lg px-3 py-2">
      <span className="text-sm text-white flex-1 min-w-0 flex items-center gap-2 flex-wrap">
        <span>{player.firstName} {player.lastName}</span>
        <TravelBadges player={player} todayKey={todayKey} />
      </span>
      <select
        value={jerseySize}
        onChange={e => setJerseySize(e.target.value)}
        className="bg-dark border border-white/10 rounded px-2 py-1 text-xs text-white appearance-none"
      >
        <option value="">Jersey</option>
        {JERSEY_SIZES.map(s => <option key={s} value={s}>{gearSizeLabel(s)}</option>)}
      </select>
      <select
        value={shortsSize}
        onChange={e => setShortsSize(e.target.value)}
        className="bg-dark border border-white/10 rounded px-2 py-1 text-xs text-white appearance-none"
      >
        <option value="">Shorts</option>
        {SHORTS_SIZES.map(s => <option key={s} value={s}>{gearSizeLabel(s)}</option>)}
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
