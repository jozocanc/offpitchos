'use client'

import { useMemo, useState } from 'react'
import Modal from '@/components/modal'
import {
  AVAILABILITY_LABELS,
  AVAILABILITY_RANK,
  playerFullName,
  positionLine,
  slotAccepts,
  type Availability,
  type PlanPlayer,
} from '@/lib/game-plan'

const BADGE: Record<Availability, string> = {
  available: 'bg-green/10 text-green border-green/20',
  limited: 'bg-yellow-500/15 text-yellow-800 border-yellow-500/30',
  out: 'bg-red/10 text-red border-red/25',
  unknown: 'bg-black/5 text-gray border-black/10',
}

export function AvailabilityBadge({ value }: { value: Availability }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold ${BADGE[value]}`}>
      {AVAILABILITY_LABELS[value]}
    </span>
  )
}

/**
 * Player picker in a sheet. Type a number and an unambiguous match is picked
 * at once ("10" picks #10 unless #100+ exists; "1" waits while #10-#19
 * exist, Enter takes #1). Or type part of a name. Out players sort last.
 */
export default function PlayerPicker({
  title,
  description,
  players,
  tags,
  currentId,
  onPick,
  onClose,
  showAvailability = true,
  actions,
  slotLabel,
}: {
  title: string
  description?: string
  players: PlanPlayer[]
  /** Short context per player, e.g. "LB", "Bench", "On: Near post". */
  tags?: Record<string, string>
  currentId?: string | null
  onPick: (playerId: string) => void
  onClose: () => void
  showAvailability?: boolean
  /** Extra buttons above the list (clear slot, captain, delete marker...). */
  actions?: React.ReactNode
  /** Lineup slot being filled ("ST", "LB"): players who play there list first. */
  slotLabel?: string
}) {
  const [query, setQuery] = useState('')
  const pick = (id: string) => {
    setQuery('')
    onPick(id)
  }

  // For a slot: players whose position fits first, then players with no
  // position, then the rest (keepers for an outfield slot, and vice versa).
  const fit = useMemo(() => {
    if (!slotLabel) return () => 0
    const accepts = slotAccepts(slotLabel)
    return (p: PlanPlayer) => {
      const line = positionLine(p.position)
      return line === null ? 1 : accepts.includes(line) ? 0 : 2
    }
  }, [slotLabel])

  const sorted = useMemo(
    () =>
      [...players].sort(
        (a, b) =>
          (showAvailability ? AVAILABILITY_RANK[a.availability] - AVAILABILITY_RANK[b.availability] : 0) ||
          fit(a) - fit(b) ||
          (a.jerseyNumber ?? 999) - (b.jerseyNumber ?? 999) ||
          a.lastName.localeCompare(b.lastName),
      ),
    [players, showAvailability, fit],
  )

  const q = query.trim().toLowerCase()
  const isNumber = /^\d{1,3}$/.test(q)
  const filtered = !q
    ? sorted
    : isNumber
      ? sorted
          .filter(p => p.jerseyNumber !== null && String(p.jerseyNumber).startsWith(q))
          .sort((a, b) => Number(String(b.jerseyNumber) === q) - Number(String(a.jerseyNumber) === q))
      : sorted.filter(p =>
          `${p.firstName} ${p.lastName}`.toLowerCase().includes(q) ||
          (p.position ?? '').toLowerCase() === q,
        )

  function onType(value: string) {
    setQuery(value)
    const v = value.trim()
    if (!/^\d{1,3}$/.test(v)) return
    const exact = players.filter(p => p.jerseyNumber !== null && String(p.jerseyNumber) === v)
    const longer = players.some(p => p.jerseyNumber !== null && String(p.jerseyNumber).length > v.length && String(p.jerseyNumber).startsWith(v))
    if (exact.length === 1 && !longer) pick(exact[0].id)
  }

  return (
    <Modal title={title} description={description} onClose={onClose} bodyClassName="p-5 sm:p-6">
      {actions && <div className="mb-3 flex flex-wrap gap-2">{actions}</div>}
      <input
        autoFocus
        value={query}
        onChange={e => onType(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter' && filtered[0]) {
            e.preventDefault()
            pick(filtered[0].id)
          }
        }}
        placeholder="Type a number or a name"
        aria-label="Search by jersey number or name"
        inputMode="search"
        className="w-full rounded-xl border border-black/15 bg-dark px-4 py-3 text-base text-white placeholder:text-gray focus:border-green focus:outline-none"
      />
      <ul className="mt-3 max-h-[52dvh] overflow-y-auto -mx-1 pr-1" role="listbox" aria-label="Players">
        {filtered.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-gray">
            {players.length === 0 ? 'No players on the roster yet.' : 'No player matches.'}
          </li>
        )}
        {filtered.map(p => {
          const tag = tags?.[p.id]
          const selected = p.id === currentId
          return (
            <li key={p.id}>
              <button
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => pick(p.id)}
                className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${
                  selected ? 'bg-green/10' : 'hover:bg-black/5'
                }`}
              >
                <span className="w-9 shrink-0 text-center text-lg font-extrabold tabular-nums text-white">
                  {p.jerseyNumber ?? '-'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-white">{playerFullName(p) || 'Unnamed player'}</span>
                  <span className="block truncate text-xs text-gray">
                    {p.position || 'No position'}
                    {tag ? ` · ${tag}` : ''}
                  </span>
                </span>
                {showAvailability && <AvailabilityBadge value={p.availability} />}
              </button>
            </li>
          )
        })}
      </ul>
    </Modal>
  )
}
