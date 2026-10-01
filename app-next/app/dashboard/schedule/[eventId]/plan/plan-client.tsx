'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import Modal from '@/components/modal'
import { useToast, isPreviewBlocked, networkErrorMessage } from '@/components/toast'
import { formatLongDate, formatTimeRange } from '@/lib/format-datetime'
import {
  SETUP_LABELS,
  SET_PIECE_LABELS,
  placedCount,
  playerFullName,
  type GamePlanDoc,
  type PlanPlayer,
  type PrintSection,
  type SetPiece,
  type SetPieceKey,
} from '@/lib/game-plan'
import { createBlankDrill } from '@/app/dashboard/tactics/actions'
import { saveGamePlan, setGamePlanShared } from '../../game-plan-actions'
import LineupEditor, { LineupPitch } from './lineup-editor'
import SetPieceEditor, { SetPieceBoard } from './set-piece-editor'
import TacticsTab from './tactics-tab'

export interface PlanEventInfo {
  id: string
  title: string
  type: string
  startTime: string
  endTime: string
  cancelled: boolean
  teamName: string
  venueName: string | null
  venueAddress: string | null
}

export interface PlanDrill {
  id: string
  title: string
  category: string
  thumbnailUrl: string | null
}

type View = 'hub' | 'lineup' | 'attack' | 'defend' | 'tactics'
const VIEWS: View[] = ['hub', 'lineup', 'attack', 'defend', 'tactics']
type SaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'error' | 'blocked'

const SAVE_DELAY_MS = 900

export default function PlanClient({
  mode,
  event,
  timeZone,
  initialDoc,
  initialShared,
  players,
  drills,
}: {
  mode: 'edit' | 'view' | 'unshared'
  event: PlanEventInfo
  timeZone: string
  initialDoc: GamePlanDoc
  initialShared: boolean
  players: PlanPlayer[]
  drills: PlanDrill[]
}) {
  const playersById = useMemo(() => new Map(players.map(p => [p.id, p])), [players])

  const header = (
    <header className="mb-5">
      <Link href="/dashboard/schedule" className="inline-flex items-center gap-1 text-sm font-semibold text-gray hover:text-white">
        <span aria-hidden="true">←</span> Schedule
      </Link>
      <h1 className="mt-2 text-2xl font-black tracking-tight">{event.title}</h1>
      <p className="mt-0.5 text-sm text-gray">
        {[
          event.teamName,
          formatLongDate(event.startTime, timeZone),
          formatTimeRange(event.startTime, event.endTime, timeZone),
          event.venueName,
        ].filter(Boolean).join(' · ')}
      </p>
      {event.cancelled && (
        <p className="mt-2 inline-block rounded-full bg-red/10 px-2.5 py-0.5 text-xs font-bold text-red">Cancelled</p>
      )}
    </header>
  )

  if (mode === 'unshared') {
    return (
      <div className="mx-auto max-w-3xl p-4 md:p-8">
        {header}
        <div className="rounded-2xl border border-black/10 bg-dark-secondary p-8 text-center">
          <p className="font-semibold text-white">The game plan isn&apos;t out yet</p>
          <p className="mt-1 text-sm text-gray">Your coaches will share the lineup here before the game.</p>
        </div>
      </div>
    )
  }

  if (mode === 'view') {
    return <PlayerView header={header} doc={initialDoc} playersById={playersById} />
  }

  return (
    <StaffPlan
      header={header}
      event={event}
      initialDoc={initialDoc}
      initialShared={initialShared}
      players={players}
      playersById={playersById}
      drills={drills}
    />
  )
}

// ─── Players: read-only ──────────────────────────────────────────────────────

function PlayerView({
  header,
  doc,
  playersById,
}: {
  header: React.ReactNode
  doc: GamePlanDoc
  playersById: Map<string, PlanPlayer>
}) {
  const captain = doc.lineup.captain_id ? playersById.get(doc.lineup.captain_id) : undefined
  const corners = (Object.keys(SET_PIECE_LABELS) as SetPieceKey[]).filter(k => doc.set_pieces[k])
  return (
    <div className="mx-auto max-w-3xl p-4 md:p-8">
      {header}
      <section className="rounded-2xl border border-black/10 bg-dark-secondary">
        <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4">
          <h2 className="text-lg font-bold text-white">Lineup · {doc.formation}</h2>
          {captain && <p className="text-sm text-gray">Captain: #{captain.jerseyNumber ?? '-'} {playerFullName(captain)}</p>}
        </div>
        <LineupPitch doc={doc} playersById={playersById} />
        {doc.lineup.bench.length > 0 && (
          <div className="border-t border-black/5 px-4 py-3">
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-gray">Bench</p>
            <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
              {doc.lineup.bench.map(id => {
                const p = playersById.get(id)
                return p ? (
                  <li key={id} className="text-sm text-white">
                    <span className="inline-block w-8 font-bold tabular-nums">{p.jerseyNumber ?? '-'}</span>
                    {playerFullName(p)}
                  </li>
                ) : null
              })}
            </ul>
          </div>
        )}
      </section>
      {corners.map(k => {
        const sp = doc.set_pieces[k] as SetPiece
        return (
          <section key={k} className="mt-4 rounded-2xl border border-black/10 bg-dark-secondary">
            <div className="flex flex-wrap items-baseline justify-between gap-2 px-4 pt-4">
              <h2 className="text-lg font-bold text-white">{SET_PIECE_LABELS[k]}</h2>
              {sp.setup && <p className="text-sm text-gray">{SETUP_LABELS[sp.setup]}</p>}
            </div>
            <SetPieceBoard setPiece={sp} slots={doc.lineup.slots} playersById={playersById} />
            {sp.notes.trim() && <p className="whitespace-pre-line px-4 pb-4 text-sm text-white">{sp.notes}</p>}
          </section>
        )
      })}
    </div>
  )
}

// ─── Staff: hub + editors ────────────────────────────────────────────────────

function StaffPlan({
  header,
  event,
  initialDoc,
  initialShared,
  players,
  playersById,
  drills,
}: {
  header: React.ReactNode
  event: PlanEventInfo
  initialDoc: GamePlanDoc
  initialShared: boolean
  players: PlanPlayer[]
  playersById: Map<string, PlanPlayer>
  drills: PlanDrill[]
}) {
  const { toast } = useToast()
  const router = useRouter()
  const searchParams = useSearchParams()
  const rawView = searchParams.get('s') as View | null
  const view: View = rawView && VIEWS.includes(rawView) ? rawView : 'hub'
  const [attackSide, setAttackSide] = useState<'corner_attack_left' | 'corner_attack_right'>('corner_attack_left')

  const [doc, setDoc] = useState<GamePlanDoc>(initialDoc)
  const [shared, setShared] = useState(initialShared)
  const [sharing, setSharing] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [printOpen, setPrintOpen] = useState(false)
  const [creatingDrill, setCreatingDrill] = useState(false)

  // ── Autosave ──
  const docRef = useRef(initialDoc)
  const dirty = useRef(false)
  const inFlight = useRef<Promise<boolean> | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const blocked = useRef(false)

  const flush = useCallback(async (): Promise<boolean> => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
    if (blocked.current) return false
    while (inFlight.current) await inFlight.current
    if (!dirty.current) return true
    dirty.current = false
    setSaveState('saving')
    const run = (async () => {
      const res = await saveGamePlan(event.id, docRef.current).catch(() => ({ ok: false as const, error: networkErrorMessage() }))
      if (res.ok) {
        setSaveState(dirty.current ? 'pending' : 'saved')
        return true
      }
      if (isPreviewBlocked(res.error)) {
        blocked.current = true
        setSaveState('blocked')
        toast(res.error, 'error')
        return false
      }
      dirty.current = true
      setSaveState('error')
      toast(res.error, 'error', { action: { label: 'Retry', onClick: () => { void flush() } } })
      return false
    })()
    inFlight.current = run
    try {
      return await run
    } finally {
      inFlight.current = null
    }
  }, [event.id, toast])

  const update = useCallback((fn: (d: GamePlanDoc) => GamePlanDoc) => {
    const next = fn(docRef.current)
    docRef.current = next
    setDoc(next)
    if (blocked.current) return
    dirty.current = true
    setSaveState('pending')
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { void flush() }, SAVE_DELAY_MS)
  }, [flush])

  // Save before the tab goes away; warn if a save is still pending.
  useEffect(() => {
    function onHide() {
      if (document.visibilityState === 'hidden' && dirty.current) void flush()
    }
    function onBeforeUnload(e: BeforeUnloadEvent) {
      if (dirty.current || inFlight.current) {
        void flush()
        e.preventDefault()
      }
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('beforeunload', onBeforeUnload)
    }
  }, [flush])

  function go(v: View) {
    const params = new URLSearchParams(searchParams.toString())
    if (v === 'hub') params.delete('s')
    else params.set('s', v)
    const qs = params.toString()
    window.history.pushState(null, '', qs ? `?${qs}` : window.location.pathname)
    window.scrollTo({ top: 0 })
  }

  async function toggleShare() {
    if (sharing) return
    const next = !shared
    setSharing(true)
    // Make sure the plan row exists and holds the latest edits first.
    dirty.current = true
    const saved = await flush()
    if (!saved) { setSharing(false); return }
    const res = await setGamePlanShared(event.id, next).catch(() => ({ ok: false as const, error: networkErrorMessage() }))
    setSharing(false)
    if (!res.ok) { toast(res.error, 'error'); return }
    setShared(res.data.shared)
    if (res.data.shared) {
      toast(
        res.data.notified > 0
          ? `Shared. ${res.data.notified} player${res.data.notified === 1 ? '' : 's'} got a push.`
          : 'Shared with players. They see the lineup and corners, read-only.',
        'success',
      )
    } else {
      toast('Players can no longer see the plan.', 'info')
    }
  }

  async function createDrill() {
    setCreatingDrill(true)
    const res = await createBlankDrill(null).catch(() => ({ ok: false as const, error: networkErrorMessage() }))
    if (!res.ok) { setCreatingDrill(false); toast(res.error, 'error'); return }
    update(d => ({ ...d, drill_ids: d.drill_ids.includes(res.data) ? d.drill_ids : [...d.drill_ids, res.data] }))
    const saved = await flush()
    if (!saved) { setCreatingDrill(false); return }
    router.push(`/dashboard/tactics/${res.data}`)
  }

  const setPiece = (k: SetPieceKey) => (sp: SetPiece | null) =>
    update(d => ({ ...d, set_pieces: { ...d.set_pieces, [k]: sp } }))

  // ── Tile statuses ──
  const placed = placedCount(doc.lineup)
  // Corners are built from the 11 in the lineup, so they open once it's complete.
  const lineupReady = placed === 11
  const left = doc.set_pieces.corner_attack_left
  const right = doc.set_pieces.corner_attack_right
  const defend = doc.set_pieces.corner_defend
  const attackStatus =
    left && right ? 'Left and right set up' : left ? 'Left set up · right not yet' : right ? 'Right set up · left not yet' : 'Not set up yet'
  const drillCount = doc.drill_ids.length

  const toolbar = (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <SaveIndicator state={saveState} />
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={toggleShare}
          disabled={sharing}
          role="switch"
          aria-checked={shared}
          className={`inline-flex items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-semibold transition-colors disabled:opacity-60 ${
            shared ? 'border-green bg-green/10 text-green' : 'border-black/15 text-white hover:bg-black/5'
          }`}
        >
          <span className={`relative h-5 w-9 rounded-full transition-colors ${shared ? 'bg-green' : 'bg-black/20'}`} aria-hidden="true">
            <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-dark-secondary shadow transition-all ${shared ? 'left-[18px]' : 'left-0.5'}`} />
          </span>
          {shared ? 'Shared with players' : 'Share with players'}
        </button>
        <button
          type="button"
          onClick={() => setPrintOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-green px-4 py-2.5 text-sm font-bold text-dark hover:opacity-90"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <polyline points="6 9 6 2 18 2 18 9" /><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" /><rect x="6" y="14" width="12" height="8" />
          </svg>
          Print
        </button>
      </div>
    </div>
  )

  const back = (title: string) => (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => go('hub')}
        className="inline-flex items-center gap-1 rounded-lg py-1 text-sm font-semibold text-green hover:underline"
      >
        <span aria-hidden="true">←</span> Game plan
      </button>
      <h2 className="mt-1 text-xl font-bold text-white">{title}</h2>
    </div>
  )

  return (
    <div className="mx-auto max-w-5xl p-4 pb-28 md:p-8">
      {header}
      {toolbar}

      {view === 'hub' && (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            <Tile
              title="Lineup"
              status={`${doc.formation} · ${placed}/11 picked${doc.lineup.bench.length ? ` · ${doc.lineup.bench.length} on bench` : ''}`}
              done={placed === 11}
              onClick={() => go('lineup')}
              icon={<path d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM2 12h20M12 2v20" />}
            />
            <Tile
              title="Corners: attacking"
              status={!lineupReady && !left && !right ? `Set your lineup first · ${placed}/11 picked` : attackStatus}
              locked={!lineupReady && !left && !right}
              done={Boolean(left && right)}
              onClick={() => go('attack')}
              icon={<><path d="M4 21V3" /><path d="M4 4h10l-2 4 2 4H4" /></>}
            />
            <Tile
              title="Corners: defending"
              status={defend ? `Set up${defend.setup ? ` · ${SETUP_LABELS[defend.setup]}` : ''}` : !lineupReady ? `Set your lineup first · ${placed}/11 picked` : 'Not set up yet'}
              locked={!lineupReady && !defend}
              done={Boolean(defend)}
              onClick={() => go('defend')}
              icon={<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />}
            />
            <Tile
              title="Tactics"
              status={drillCount ? `${drillCount} drill${drillCount === 1 ? '' : 's'} attached` : 'No drills attached'}
              done={drillCount > 0}
              onClick={() => go('tactics')}
              icon={<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M7 15l3-3 3 3 4-5" /></>}
            />
          </div>

          <label className="mt-5 block">
            <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray">Game notes (printed with the lineup)</span>
            <textarea
              value={doc.notes}
              onChange={e => update(d => ({ ...d, notes: e.target.value.slice(0, 4000) }))}
              rows={3}
              placeholder="Key messages, opponent threats, kit"
              className="w-full rounded-xl border border-black/15 bg-dark-secondary px-4 py-3 text-base text-white placeholder:text-gray focus:border-green focus:outline-none"
            />
          </label>
        </>
      )}

      {view === 'lineup' && (
        <>
          {back('Lineup')}
          <LineupEditor doc={doc} players={players} playersById={playersById} onChange={update} />
        </>
      )}

      {view === 'attack' && (
        <>
          {back('Corners: attacking')}
          <div className="mb-4 inline-flex rounded-xl border border-black/15 p-1" role="tablist" aria-label="Corner side">
            {(['corner_attack_left', 'corner_attack_right'] as const).map(k => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={attackSide === k}
                onClick={() => setAttackSide(k)}
                className={`rounded-lg px-5 py-2 text-sm font-semibold ${attackSide === k ? 'bg-green text-dark' : 'text-white hover:bg-black/5'}`}
              >
                {k === 'corner_attack_left' ? 'Left' : 'Right'}
                {doc.set_pieces[k] ? '' : ' (not set)'}
              </button>
            ))}
          </div>
          {!lineupReady && !doc.set_pieces[attackSide] ? (
            <LineupGate placed={placed} onGo={() => go('lineup')} />
          ) : (
          <SetPieceEditor
            key={attackSide}
            spKey={attackSide}
            setPiece={doc.set_pieces[attackSide]}
            slots={doc.lineup.slots}
            players={players}
            playersById={playersById}
            onChange={setPiece(attackSide)}
          />
          )}
        </>
      )}

      {view === 'defend' && (
        <>
          {back('Corners: defending')}
          {!lineupReady && !doc.set_pieces.corner_defend ? (
            <LineupGate placed={placed} onGo={() => go('lineup')} />
          ) : (
          <SetPieceEditor
            spKey="corner_defend"
            setPiece={doc.set_pieces.corner_defend}
            slots={doc.lineup.slots}
            players={players}
            playersById={playersById}
            onChange={setPiece('corner_defend')}
          />
          )}
        </>
      )}

      {view === 'tactics' && (
        <>
          {back('Tactics')}
          <TacticsTab
            drills={drills}
            attachedIds={doc.drill_ids}
            onChange={ids => update(d => ({ ...d, drill_ids: ids }))}
            onCreateNew={createDrill}
            creating={creatingDrill}
          />
        </>
      )}

      {printOpen && (
        <PrintDialog
          eventId={event.id}
          doc={doc}
          drills={drills}
          flush={flush}
          onClose={() => setPrintOpen(false)}
        />
      )}
    </div>
  )
}

function Tile({
  title,
  status,
  done,
  locked = false,
  onClick,
  icon,
}: {
  title: string
  status: string
  done: boolean
  /** Waiting on another step (corners wait for a full lineup). */
  locked?: boolean
  onClick: () => void
  icon: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex min-h-[112px] w-full items-center gap-4 rounded-2xl border border-black/10 bg-dark-secondary p-5 text-left transition-colors hover:border-green/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-green ${locked ? 'opacity-70' : ''}`}
    >
      <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${done ? 'bg-green text-dark' : locked ? 'bg-black/5 text-gray' : 'bg-green/10 text-green'}`}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {icon}
        </svg>
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-lg font-bold text-white">{title}</span>
        <span className={`mt-0.5 block text-sm ${done ? 'text-green' : 'text-gray'}`}>{status}</span>
      </span>
      <span className="text-xl text-gray transition-transform group-hover:translate-x-0.5" aria-hidden="true">›</span>
    </button>
  )
}

function SaveIndicator({ state }: { state: SaveState }) {
  const text: Record<SaveState, string> = {
    idle: 'Changes save automatically',
    pending: 'Unsaved changes',
    saving: 'Saving…',
    saved: 'Saved',
    error: 'Not saved',
    blocked: 'Preview: not saved',
  }
  const tone = state === 'saved' ? 'text-green' : state === 'error' || state === 'blocked' ? 'text-red' : 'text-gray'
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${tone}`} aria-live="polite">
      {state === 'saved' && (
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
      )}
      {text[state]}
    </span>
  )
}

// ─── Print ───────────────────────────────────────────────────────────────────

function PrintDialog({
  eventId,
  doc,
  drills,
  flush,
  onClose,
}: {
  eventId: string
  doc: GamePlanDoc
  drills: PlanDrill[]
  flush: () => Promise<boolean>
  onClose: () => void
}) {
  const titleById = new Map(drills.map(d => [d.id, d.title]))
  const options: { id: PrintSection; label: string; ready: boolean; hint?: string }[] = [
    { id: 'lineup', label: 'Lineup (+ bench)', ready: placedCount(doc.lineup) > 0, hint: `${placedCount(doc.lineup)}/11 picked` },
    { id: 'corner_attack_left', label: 'Corners: attacking (left)', ready: Boolean(doc.set_pieces.corner_attack_left) },
    { id: 'corner_attack_right', label: 'Corners: attacking (right)', ready: Boolean(doc.set_pieces.corner_attack_right) },
    { id: 'corner_defend', label: 'Corners: defending', ready: Boolean(doc.set_pieces.corner_defend) },
    ...doc.drill_ids.map(id => ({ id: `drill:${id}` as PrintSection, label: titleById.get(id) ?? 'Drill', ready: true, hint: 'Tactic' })),
  ]
  const [checked, setChecked] = useState<Set<PrintSection>>(() => new Set(options.filter(o => o.ready).map(o => o.id)))
  const [paper, setPaper] = useState<'letter' | 'a4'>('letter')
  const [busy, setBusy] = useState(false)

  function toggle(id: PrintSection) {
    setChecked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function print() {
    const sections = options.filter(o => checked.has(o.id)).map(o => o.id)
    if (sections.length === 0) return
    // Open the tab inside the click so popup blockers allow it, then point
    // it at the PDF once the latest edits are saved.
    const win = window.open('', '_blank')
    setBusy(true)
    await flush()
    setBusy(false)
    const url = `/api/game-plan/pdf/${eventId}?sections=${encodeURIComponent(sections.join(','))}&paper=${paper}`
    if (win) win.location.href = url
    else window.location.href = url
    onClose()
  }

  const count = options.filter(o => checked.has(o.id)).length

  return (
    <Modal title="Print game plan" description="Pick what goes in the PDF. Sections print in this order." onClose={onClose} size="lg" bodyClassName="p-5 sm:p-7">
      <ul className="space-y-2">
        {options.map(o => {
          const on = checked.has(o.id)
          return (
            <li key={o.id}>
              <label className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-colors ${on ? 'border-green bg-green/5' : 'border-black/10 hover:border-green/30'}`}>
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(o.id)}
                  className="h-5 w-5 shrink-0 accent-[#1F4E3D]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold text-white">{o.label}</span>
                  <span className="block text-xs text-gray">{o.ready ? (o.hint ?? 'Set up') : 'Not set up yet'}</span>
                </span>
              </label>
            </li>
          )
        })}
      </ul>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray">Paper</span>
        {(['letter', 'a4'] as const).map(p => (
          <button
            key={p}
            type="button"
            onClick={() => setPaper(p)}
            aria-pressed={paper === p}
            className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold ${paper === p ? 'border-green bg-green text-dark' : 'border-black/15 text-white'}`}
          >
            {p === 'letter' ? 'Letter' : 'A4'}
          </button>
        ))}
      </div>

      <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <button type="button" onClick={onClose} className="rounded-xl border border-black/15 px-5 py-3 text-sm font-semibold text-white hover:bg-black/5">
          Cancel
        </button>
        <button
          type="button"
          onClick={print}
          disabled={count === 0 || busy}
          className="rounded-xl bg-green px-6 py-3 text-sm font-bold text-dark hover:opacity-90 disabled:opacity-50"
        >
          {busy ? 'Preparing…' : count === 0 ? 'Pick at least one' : `Print ${count} section${count === 1 ? '' : 's'}`}
        </button>
      </div>
    </Modal>
  )
}

/** Shown in a corner view until the lineup has all 11. */
function LineupGate({ placed, onGo }: { placed: number; onGo: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-black/15 bg-dark-secondary px-6 py-10 text-center">
      <p className="text-lg font-bold text-white">Pick your 11 first</p>
      <p className="mx-auto mt-1 max-w-md text-sm text-gray">
        Corners are built from the players in your lineup, so the lineup comes first. You have {placed} of 11 picked.
      </p>
      <button
        type="button"
        onClick={onGo}
        className="mt-5 rounded-xl bg-green px-5 py-2.5 text-sm font-bold text-dark hover:opacity-90"
      >
        Go to lineup
      </button>
    </div>
  )
}
