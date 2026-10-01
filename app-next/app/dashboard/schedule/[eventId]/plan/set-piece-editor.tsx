'use client'

import { useEffect, useRef, useState } from 'react'
import { useToast } from '@/components/toast'
import { useConfirm } from '@/components/confirm-dialog'
import {
  SETUPS,
  SETUP_LABELS,
  cornerTemplate,
  markerPlayerId,
  playerShortName,
  type LineupSlot,
  type PlanPlayer,
  type SetPiece,
  type SetPieceArrow,
  type SetPieceKey,
  type SetPieceMarker,
} from '@/lib/game-plan'
import { BoxMarkings, PITCH_FRAME_CLASS, PITCH_FRAME_STYLE, PlayerToken, useBoardDrag } from './pitch'
import PlayerPicker from './player-picker'

const ARROW_COLOR = '#ffffff'

function newId(prefix: string, taken: string[]): string {
  let i = taken.length + 1
  while (taken.includes(`${prefix}${i}`)) i++
  return `${prefix}${i}`
}

/** The box board. Read-only when the handlers are omitted. */
export function SetPieceBoard({
  setPiece,
  slots,
  playersById,
  mode = 'move',
  onMarkerTap,
  onMarkerMove,
  onArrowAdd,
  onArrowTap,
}: {
  setPiece: SetPiece
  slots: LineupSlot[]
  playersById: Map<string, PlanPlayer>
  mode?: 'move' | 'arrow'
  onMarkerTap?: (id: string) => void
  onMarkerMove?: (id: string, x: number, y: number) => void
  onArrowAdd?: (a: Omit<SetPieceArrow, 'id'>) => void
  onArrowTap?: (id: string) => void
}) {
  const boardRef = useRef<HTMLDivElement>(null)
  const drag = useBoardDrag(boardRef)
  const editable = Boolean(onMarkerTap)
  // Arrow drawing: drag start->end, or tap start then tap end.
  const [pending, setPending] = useState<{ x: number; y: number } | null>(null)
  const [preview, setPreview] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)
  const down = useRef<{ id: number; x: number; y: number; sx: number; sy: number; moved: boolean } | null>(null)

  function rel(e: React.PointerEvent) {
    const r = boardRef.current!.getBoundingClientRect()
    return {
      x: Math.round(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)) * 1000) / 1000,
      y: Math.round(Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) * 1000) / 1000,
    }
  }

  const drawing = editable && mode === 'arrow' && onArrowAdd
  const boardHandlers = drawing
    ? {
        onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
          e.currentTarget.setPointerCapture(e.pointerId)
          const p = rel(e)
          down.current = { id: e.pointerId, ...p, sx: e.clientX, sy: e.clientY, moved: false }
        },
        onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
          const d = down.current
          if (!d || d.id !== e.pointerId) return
          if (!d.moved && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 8) return
          d.moved = true
          const p = rel(e)
          setPreview({ x1: d.x, y1: d.y, x2: p.x, y2: p.y })
        },
        onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
          const d = down.current
          down.current = null
          setPreview(null)
          if (!d || d.id !== e.pointerId) return
          const p = rel(e)
          if (d.moved) {
            onArrowAdd({ x1: d.x, y1: d.y, x2: p.x, y2: p.y })
            setPending(null)
          } else if (pending) {
            if (Math.hypot(p.x - pending.x, p.y - pending.y) > 0.02) onArrowAdd({ x1: pending.x, y1: pending.y, x2: p.x, y2: p.y })
            setPending(null)
          } else {
            setPending(p)
          }
        },
        onPointerCancel() {
          down.current = null
          setPreview(null)
        },
      }
    : {}

  const W = 68
  const H = 36
  const arrows = preview ? [...setPiece.arrows, { id: '__preview', ...preview }] : setPiece.arrows

  return (
    <div className={`w-full ${PITCH_FRAME_CLASS} pt-5`} style={PITCH_FRAME_STYLE}>
      <div
        ref={boardRef}
        className={`relative w-full ${drawing ? 'cursor-crosshair touch-none' : ''}`}
        style={{ aspectRatio: `${W} / ${H}` }}
        {...boardHandlers}
      >
        <BoxMarkings />
        <svg viewBox={`0 0 ${W} ${H}`} className="absolute inset-0 h-full w-full overflow-visible" aria-hidden={!onArrowTap}>
          <defs>
            <marker id="gp-arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
              <path d="M 0 0 L 10 5 L 0 10 z" fill={ARROW_COLOR} />
            </marker>
          </defs>
          {arrows.map(a => (
            <g key={a.id}>
              <line
                x1={a.x1 * W} y1={a.y1 * H} x2={a.x2 * W} y2={a.y2 * H}
                stroke={ARROW_COLOR}
                strokeWidth={0.45}
                strokeDasharray={a.id === '__preview' ? '1 0.8' : undefined}
                markerEnd="url(#gp-arrowhead)"
                opacity={0.95}
              />
              {onArrowTap && mode === 'move' && a.id !== '__preview' && (
                <line
                  x1={a.x1 * W} y1={a.y1 * H} x2={a.x2 * W} y2={a.y2 * H}
                  stroke="transparent"
                  strokeWidth={3}
                  style={{ cursor: 'pointer', pointerEvents: 'stroke' }}
                  onClick={() => onArrowTap(a.id)}
                >
                  <title>Tap to remove this arrow</title>
                </line>
              )}
            </g>
          ))}
          {pending && <circle cx={pending.x * W} cy={pending.y * H} r={0.9} fill={ARROW_COLOR} />}
        </svg>
        {setPiece.markers.map(m => {
          const pid = markerPlayerId(m, slots)
          const p = pid ? playersById.get(pid) : undefined
          const h = drag({
            disabled: !editable || mode !== 'move',
            onTap: onMarkerTap && mode === 'move' ? () => onMarkerTap(m.id) : undefined,
            onMove: onMarkerMove ? (x, y) => onMarkerMove(m.id, x, y) : undefined,
          })
          return (
            <div
              key={m.id}
              role={editable && mode === 'move' ? 'button' : undefined}
              tabIndex={editable && mode === 'move' ? 0 : undefined}
              aria-label={`${m.role_label || 'Marker'}: ${p ? `${p.jerseyNumber ?? ''} ${playerShortName(p)}` : 'no player'}`}
              className={`absolute -translate-x-1/2 -translate-y-1/2 ${
                editable && mode === 'move' ? 'cursor-grab touch-none rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-white' : ''
              } ${mode === 'arrow' ? 'pointer-events-none' : ''}`}
              style={{ left: `${m.x * 100}%`, top: `${m.y * 100}%` }}
              {...h}
            >
              <PlayerToken
                size="sm"
                number={p?.jerseyNumber ?? null}
                name={p ? playerShortName(p) : '?'}
                label={m.role_label}
                keeper={m.role_label === 'GK'}
              />
            </div>
          )
        })}
      </div>
      {drawing && (
        <p className="mt-2 text-center text-xs text-gray">
          {pending ? 'Now tap where the arrow ends.' : 'Drag to draw an arrow, or tap the start and then the end.'}
        </p>
      )}
    </div>
  )
}

export default function SetPieceEditor({
  spKey,
  setPiece,
  slots,
  players,
  playersById,
  onChange,
}: {
  spKey: SetPieceKey
  setPiece: SetPiece | null
  slots: LineupSlot[]
  players: PlanPlayer[]
  playersById: Map<string, PlanPlayer>
  onChange: (sp: SetPiece | null) => void
}) {
  const { toast } = useToast()
  const { confirm, dialog } = useConfirm()
  const [mode, setMode] = useState<'move' | 'arrow'>('move')
  const [editing, setEditing] = useState<string | null>(null)
  // Latest board for the toast's Undo, which fires after later edits.
  const latest = useRef(setPiece)
  useEffect(() => { latest.current = setPiece })

  if (!setPiece) {
    return (
      <div className="rounded-2xl border border-dashed border-black/20 bg-dark-secondary p-6 text-center">
        <p className="font-semibold text-white">Not set up yet</p>
        <p className="mx-auto mt-1 max-w-sm text-sm text-gray">
          {spKey === 'corner_defend'
            ? 'The template puts a zonal line on the six-yard box, players on the posts and three man-markers, taken from your lineup.'
            : 'The template places near post, far post, penalty spot, GK screen, edge of the box, a short option and two in rest defense, taken from your lineup.'}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => onChange(cornerTemplate(spKey, slots))}
            className="rounded-xl bg-green px-5 py-3 text-sm font-bold text-dark hover:opacity-90"
          >
            Start from the template
          </button>
          <button
            type="button"
            onClick={() => onChange({ setup: null, markers: [], arrows: [], notes: '' })}
            className="rounded-xl border border-black/15 px-5 py-3 text-sm font-semibold text-white hover:bg-black/5"
          >
            Start blank
          </button>
        </div>
      </div>
    )
  }

  const sp = setPiece
  const set = (patch: Partial<SetPiece>) => onChange({ ...sp, ...patch })
  const marker = editing ? sp.markers.find(m => m.id === editing) : undefined

  const markerTags: Record<string, string> = {}
  for (const m of sp.markers) {
    const pid = markerPlayerId(m, slots)
    if (pid) markerTags[pid] = `On: ${m.role_label || 'marker'}`
  }
  for (const s of slots) if (s.player_id && !markerTags[s.player_id]) markerTags[s.player_id] = `In XI: ${s.label}`

  function updateMarker(id: string, patch: Partial<SetPieceMarker>) {
    set({ markers: sp.markers.map(m => (m.id === id ? { ...m, ...patch } : m)) })
  }

  /** Assign a player; if they already hold another marker, the two swap. */
  function assignMarker(id: string, playerId: string) {
    const target = sp.markers.find(m => m.id === id)
    if (!target) return
    const prev = markerPlayerId(target, slots)
    set({
      markers: sp.markers.map(m => {
        if (m.id === id) return { ...m, player_id: playerId, slot_id: null }
        if (markerPlayerId(m, slots) === playerId) return { ...m, player_id: prev, slot_id: null }
        return m
      }),
    })
  }

  function removeArrow(id: string) {
    const removed = sp.arrows.find(a => a.id === id)
    if (!removed) return
    set({ arrows: sp.arrows.filter(a => a.id !== id) })
    toast('Arrow removed', 'info', {
      action: {
        label: 'Undo',
        onClick: () => {
          const cur = latest.current
          if (cur && !cur.arrows.some(a => a.id === removed.id)) onChange({ ...cur, arrows: [...cur.arrows, removed] })
        },
      },
    })
  }

  async function resetTemplate() {
    const ok = await confirm({
      title: 'Reset to the template?',
      message: 'Replaces every marker, arrow and the setup on this board. Notes are kept.',
      confirmLabel: 'Reset',
      destructive: true,
    })
    if (ok) onChange({ ...cornerTemplate(spKey, slots), notes: sp.notes })
  }

  return (
    <div className="space-y-4">
      {/* Toolbar: big, visible buttons, no hidden menus. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-xl border border-black/15 p-1" role="group" aria-label="Board mode">
          {(['move', 'arrow'] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${mode === m ? 'bg-green text-dark' : 'text-white hover:bg-black/5'}`}
            >
              {m === 'move' ? 'Move players' : 'Draw arrows'}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => {
            if (sp.markers.length >= 16) { toast('Up to 16 markers per board.', 'error'); return }
            const id = newId('m', sp.markers.map(m => m.id))
            set({ markers: [...sp.markers, { id, player_id: null, slot_id: null, x: 0.5, y: 0.6, role_label: '' }] })
            setMode('move')
            setEditing(id)
          }}
          className="rounded-xl border border-black/15 px-4 py-2.5 text-sm font-semibold text-white hover:bg-black/5"
        >
          + Add player
        </button>
        <button
          type="button"
          disabled={sp.arrows.length === 0}
          onClick={() => set({ arrows: sp.arrows.slice(0, -1) })}
          className="rounded-xl border border-black/15 px-4 py-2.5 text-sm font-semibold text-white hover:bg-black/5 disabled:opacity-40"
        >
          Undo arrow
        </button>
        <button
          type="button"
          disabled={sp.arrows.length === 0}
          onClick={() => set({ arrows: [] })}
          className="rounded-xl border border-black/15 px-4 py-2.5 text-sm font-semibold text-white hover:bg-black/5 disabled:opacity-40"
        >
          Clear arrows
        </button>
        <button
          type="button"
          onClick={resetTemplate}
          className="rounded-xl border border-black/15 px-4 py-2.5 text-sm font-semibold text-gray hover:bg-black/5"
        >
          Reset to template
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray">Setup</span>
        {SETUPS.map(s => (
          <button
            key={s}
            type="button"
            onClick={() => set({ setup: sp.setup === s ? null : s })}
            aria-pressed={sp.setup === s}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold ${
              sp.setup === s ? 'border-green bg-green text-dark' : 'border-black/15 text-white hover:border-green/40'
            }`}
          >
            {SETUP_LABELS[s]}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-black/10 bg-dark-secondary">
        <SetPieceBoard
          setPiece={sp}
          slots={slots}
          playersById={playersById}
          mode={mode}
          onMarkerTap={id => setEditing(id)}
          onMarkerMove={(id, x, y) => updateMarker(id, { x, y })}
          onArrowAdd={a => {
            if (sp.arrows.length >= 30) { toast('Up to 30 arrows per board.', 'error'); return }
            set({ arrows: [...sp.arrows, { id: newId('a', sp.arrows.map(x => x.id)), ...a }] })
          }}
          onArrowTap={removeArrow}
        />
        {mode === 'move' && (
          <p className="px-4 pb-3 text-center text-xs text-gray">
            Tap a player to change who it is or its job. Drag to move. Tap an arrow to remove it.
          </p>
        )}
      </div>

      <label className="block">
        <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray">Notes</span>
        <textarea
          value={sp.notes}
          onChange={e => set({ notes: e.target.value.slice(0, 1000) })}
          rows={3}
          placeholder="Signals, delivery, who attacks what"
          className="w-full rounded-xl border border-black/15 bg-dark-secondary px-4 py-3 text-base text-white placeholder:text-gray focus:border-green focus:outline-none"
        />
      </label>

      {marker && (
        <PlayerPicker
          title={marker.role_label ? `${marker.role_label}: pick a player` : 'Pick a player'}
          players={players}
          tags={markerTags}
          currentId={markerPlayerId(marker, slots)}
          onPick={id => {
            assignMarker(marker.id, id)
            setEditing(null)
          }}
          onClose={() => setEditing(null)}
          actions={
            <div className="w-full space-y-2">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray">Job on this corner</span>
                <input
                  value={marker.role_label}
                  onChange={e => updateMarker(marker.id, { role_label: e.target.value.slice(0, 24) })}
                  placeholder="e.g. Near post, Zone 1, Blocker"
                  className="w-full rounded-xl border border-black/15 bg-dark px-4 py-2.5 text-base text-white placeholder:text-gray focus:border-green focus:outline-none"
                />
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(null)}
                  className="rounded-xl bg-green px-4 py-2 text-sm font-bold text-dark"
                >
                  Done
                </button>
                {markerPlayerId(marker, slots) && (
                  <button
                    type="button"
                    onClick={() => updateMarker(marker.id, { player_id: null, slot_id: null })}
                    className="rounded-xl border border-black/15 px-3 py-2 text-sm font-semibold text-white hover:bg-black/5"
                  >
                    No player
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    set({ markers: sp.markers.filter(m => m.id !== marker.id) })
                    setEditing(null)
                  }}
                  className="rounded-xl border border-black/15 px-3 py-2 text-sm font-semibold text-red hover:bg-red/5"
                >
                  Delete marker
                </button>
              </div>
            </div>
          }
        />
      )}

      {dialog}
    </div>
  )
}
