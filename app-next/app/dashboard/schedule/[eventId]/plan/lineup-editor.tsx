'use client'

import { useMemo, useRef, useState } from 'react'
import { useToast } from '@/components/toast'
import { useConfirm } from '@/components/confirm-dialog'
import {
  FORMATIONS,
  MAX_BENCH,
  assignSlot,
  autoFillLineup,
  changeFormation,
  placedCount,
  playerFullName,
  playerShortName,
  presetSlots,
  remapSetPieceSlots,
  slotLine,
  withoutPlayer,
  type Formation,
  type GamePlanDoc,
  type Lineup,
  type PlanPlayer,
} from '@/lib/game-plan'
import { FullPitchMarkings, PITCH_FRAME_CLASS, PITCH_FRAME_STYLE, PlayerToken, useBoardDrag } from './pitch'
import PlayerPicker, { AvailabilityBadge } from './player-picker'

type Picker =
  | { kind: 'slot'; slotId: string }
  | { kind: 'bench' }
  | { kind: 'captain' }

/**
 * Lineup pitch. Read-only when onChange is omitted (players' view, print
 * preview). Staff: tap a slot to pick, drag to fine-tune.
 */
export function LineupPitch({
  doc,
  playersById,
  showStatus,
  onSlotTap,
  onSlotMove,
}: {
  doc: GamePlanDoc
  playersById: Map<string, PlanPlayer>
  showStatus?: boolean
  onSlotTap?: (slotId: string) => void
  onSlotMove?: (slotId: string, x: number, y: number) => void
}) {
  const boardRef = useRef<HTMLDivElement>(null)
  const drag = useBoardDrag(boardRef)
  const editable = Boolean(onSlotTap)
  return (
    <div className={`mx-auto w-full max-w-[440px] ${PITCH_FRAME_CLASS}`} style={PITCH_FRAME_STYLE}>
      <div ref={boardRef} className="relative w-full" style={{ aspectRatio: '68 / 105' }}>
        <FullPitchMarkings />
        {doc.lineup.slots.map(slot => {
          const p = slot.player_id ? playersById.get(slot.player_id) : undefined
          const status = showStatus && p && (p.availability === 'out' || p.availability === 'limited') ? p.availability : null
          const h = drag({
            disabled: !editable,
            onTap: onSlotTap ? () => onSlotTap(slot.slot_id) : undefined,
            onMove: onSlotMove ? (x, y) => onSlotMove(slot.slot_id, x, y) : undefined,
          })
          return (
            <div
              key={slot.slot_id}
              role={editable ? 'button' : undefined}
              tabIndex={editable ? 0 : undefined}
              aria-label={
                p
                  ? `${slot.label}: ${p.jerseyNumber ?? ''} ${playerFullName(p)}${editable ? '. Tap to change, drag to move.' : ''}`
                  : `${slot.label}: empty${editable ? '. Tap to pick a player.' : ''}`
              }
              className={`absolute -translate-x-1/2 -translate-y-1/2 ${editable ? 'cursor-grab touch-none active:cursor-grabbing focus:outline-none focus-visible:ring-2 focus-visible:ring-white rounded-full' : ''}`}
              style={{ left: `${slot.x * 100}%`, top: `${slot.y * 100}%` }}
              {...h}
            >
              <PlayerToken
                number={p?.jerseyNumber ?? null}
                name={p ? playerShortName(p) : ''}
                label={slot.label}
                empty={!p}
                keeper={slotLine(slot.label) === 'GK'}
                captain={Boolean(p && doc.lineup.captain_id === p.id)}
                status={status}
              />
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function LineupEditor({
  doc,
  players,
  playersById,
  onChange,
}: {
  doc: GamePlanDoc
  players: PlanPlayer[]
  playersById: Map<string, PlanPlayer>
  onChange: (fn: (d: GamePlanDoc) => GamePlanDoc) => void
}) {
  const { toast } = useToast()
  const { confirm, dialog } = useConfirm()
  const [picker, setPicker] = useState<Picker | null>(null)
  const lineup = doc.lineup

  const setLineup = (fn: (l: Lineup) => Lineup) => onChange(d => ({ ...d, lineup: fn(d.lineup) }))

  // Where each player currently is, for the picker's context column.
  const tags = useMemo(() => {
    const t: Record<string, string> = {}
    for (const s of lineup.slots) if (s.player_id) t[s.player_id] = `In XI: ${s.label}`
    for (const id of lineup.bench) t[id] = 'Bench'
    if (lineup.captain_id && t[lineup.captain_id]) t[lineup.captain_id] += ' (C)'
    return t
  }, [lineup])

  function pickFormation(f: Formation) {
    if (f === doc.formation) return
    onChange(d => {
      const { lineup: next, slotMap } = changeFormation(d.lineup, f)
      return {
        ...d,
        formation: f,
        lineup: next,
        set_pieces: remapSetPieceSlots(d.set_pieces, d.lineup.slots, next.slots, slotMap),
      }
    })
  }

  function autoFill() {
    const empty = 11 - placedCount(lineup)
    if (empty === 0) {
      toast('Every slot is already filled. Clear a slot to auto-fill it.', 'info')
      return
    }
    const { lineup: next, filled } = autoFillLineup(lineup, players)
    if (filled === 0) {
      toast('No available players left to place. Limited and Out players are never auto-picked.', 'info')
      return
    }
    setLineup(() => next)
    const left = empty - filled
    toast(
      left > 0
        ? `Placed ${filled} player${filled === 1 ? '' : 's'}. ${left} slot${left === 1 ? '' : 's'} still empty.`
        : `Placed ${filled} player${filled === 1 ? '' : 's'}. Check the picks and adjust.`,
      'success',
    )
  }

  async function clearAll() {
    if (placedCount(lineup) === 0 && lineup.bench.length === 0) return
    const ok = await confirm({
      title: 'Clear the lineup?',
      message: 'Empties all 11 slots and the bench and resets positions. Corners keep their layout.',
      confirmLabel: 'Clear lineup',
      destructive: true,
    })
    if (!ok) return
    setLineup(() => ({ slots: presetSlots(doc.formation), bench: [], captain_id: null }))
  }

  function onPick(playerId: string) {
    if (!picker) return
    if (picker.kind === 'slot') {
      setLineup(l => assignSlot(l, picker.slotId, playerId))
      setPicker(null)
    } else if (picker.kind === 'bench') {
      if (lineup.bench.includes(playerId)) {
        setLineup(l => ({ ...l, bench: l.bench.filter(id => id !== playerId) }))
        return
      }
      if (lineup.bench.length >= MAX_BENCH) {
        toast(`The bench holds up to ${MAX_BENCH} players.`, 'error')
        return
      }
      setLineup(l => {
        const base = withoutPlayer(l, playerId)
        return { ...base, bench: [...base.bench, playerId] }
      })
    } else {
      setLineup(l => ({ ...l, captain_id: l.captain_id === playerId ? null : playerId }))
      setPicker(null)
    }
  }

  const slot = picker?.kind === 'slot' ? lineup.slots.find(s => s.slot_id === picker.slotId) : null
  const slotPlayer = slot?.player_id ? playersById.get(slot.player_id) : undefined
  const xiIds = lineup.slots.map(s => s.player_id).filter(Boolean) as string[]
  const captain = lineup.captain_id ? playersById.get(lineup.captain_id) : undefined

  return (
    <div className="space-y-4">
      {/* Formation chips */}
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray">Formation</p>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {FORMATIONS.map(f => (
            <button
              key={f}
              type="button"
              onClick={() => pickFormation(f)}
              aria-pressed={f === doc.formation}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm font-bold tabular-nums transition-colors ${
                f === doc.formation
                  ? 'border-green bg-green text-dark'
                  : 'border-black/15 bg-dark-secondary text-white hover:border-green/40'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={autoFill}
          className="rounded-xl bg-green px-4 py-2.5 text-sm font-bold text-dark hover:opacity-90"
        >
          Auto-fill from availability
        </button>
        <button
          type="button"
          onClick={clearAll}
          className="rounded-xl border border-black/15 px-4 py-2.5 text-sm font-semibold text-white hover:bg-black/5"
        >
          Clear lineup
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)] lg:items-start">
        <div className="rounded-2xl border border-black/10 bg-dark-secondary p-3">
          <LineupPitch
            doc={doc}
            playersById={playersById}
            showStatus
            onSlotTap={slotId => setPicker({ kind: 'slot', slotId })}
            onSlotMove={(slotId, x, y) =>
              setLineup(l => ({ ...l, slots: l.slots.map(s => (s.slot_id === slotId ? { ...s, x, y } : s)) }))
            }
          />
          <p className="px-2 pt-3 text-center text-xs text-gray">
            Tap a circle to pick a player. Drag it to fine-tune the position.
          </p>
        </div>

        <div className="space-y-4">
          {/* Captain */}
          <section className="rounded-2xl border border-black/10 bg-dark-secondary p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray">Captain</p>
                <p className="truncate font-semibold text-white">
                  {captain ? `#${captain.jerseyNumber ?? '-'} ${playerFullName(captain)}` : 'Not picked'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPicker({ kind: 'captain' })}
                disabled={xiIds.length === 0}
                className="shrink-0 rounded-xl border border-black/15 px-4 py-2 text-sm font-semibold text-white hover:bg-black/5 disabled:opacity-40"
              >
                {captain ? 'Change' : 'Pick captain'}
              </button>
            </div>
          </section>

          {/* Bench */}
          <section className="rounded-2xl border border-black/10 bg-dark-secondary p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray">
                Bench ({lineup.bench.length})
              </p>
              <button
                type="button"
                onClick={() => setPicker({ kind: 'bench' })}
                className="rounded-xl bg-green/10 px-4 py-2 text-sm font-bold text-green hover:bg-green/20"
              >
                + Add subs
              </button>
            </div>
            {lineup.bench.length === 0 ? (
              <p className="py-2 text-sm text-gray">No subs yet.</p>
            ) : (
              <ul className="divide-y divide-black/5">
                {lineup.bench.map(id => {
                  const p = playersById.get(id)
                  if (!p) return null
                  return (
                    <li key={id} className="flex items-center gap-3 py-2">
                      <span className="w-8 text-center font-extrabold tabular-nums text-white">{p.jerseyNumber ?? '-'}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-white">{playerFullName(p)}</span>
                        <span className="block truncate text-xs text-gray">{p.position || 'No position'}</span>
                      </span>
                      <AvailabilityBadge value={p.availability} />
                      <button
                        type="button"
                        onClick={() => setLineup(l => ({ ...l, bench: l.bench.filter(b => b !== id) }))}
                        aria-label={`Remove ${playerFullName(p)} from the bench`}
                        className="rounded-lg p-2 text-gray hover:bg-black/5 hover:text-red"
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
                          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        </div>
      </div>

      {picker?.kind === 'slot' && slot && (
        <PlayerPicker
          title={`${slot.label}: pick a player`}
          slotLabel={slot.label}
          players={players}
          tags={tags}
          currentId={slot.player_id}
          onPick={onPick}
          onClose={() => setPicker(null)}
          actions={
            slotPlayer ? (
              <>
                <button
                  type="button"
                  onClick={() => setLineup(l => ({ ...l, captain_id: l.captain_id === slotPlayer.id ? null : slotPlayer.id }))}
                  aria-pressed={lineup.captain_id === slotPlayer.id}
                  className={`rounded-xl border px-3 py-2 text-sm font-semibold ${
                    lineup.captain_id === slotPlayer.id
                      ? 'border-green bg-green text-dark'
                      : 'border-black/15 text-white hover:bg-black/5'
                  }`}
                >
                  {lineup.captain_id === slotPlayer.id ? 'Captain (C)' : 'Make captain'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setLineup(l => assignSlot(l, slot.slot_id, null))
                    setPicker(null)
                  }}
                  className="rounded-xl border border-black/15 px-3 py-2 text-sm font-semibold text-red hover:bg-red/5"
                >
                  Clear slot
                </button>
              </>
            ) : undefined
          }
        />
      )}

      {picker?.kind === 'bench' && (
        <PlayerPicker
          title="Add subs"
          description="Tap players to add them. Tap again to take them off the bench."
          players={players}
          tags={tags}
          onPick={onPick}
          onClose={() => setPicker(null)}
          actions={
            <button
              type="button"
              onClick={() => setPicker(null)}
              className="rounded-xl bg-green px-4 py-2 text-sm font-bold text-dark"
            >
              Done ({lineup.bench.length} on bench)
            </button>
          }
        />
      )}

      {picker?.kind === 'captain' && (
        <PlayerPicker
          title="Pick the captain"
          players={players.filter(p => xiIds.includes(p.id))}
          tags={tags}
          currentId={lineup.captain_id}
          onPick={onPick}
          onClose={() => setPicker(null)}
        />
      )}

      {dialog}
    </div>
  )
}
