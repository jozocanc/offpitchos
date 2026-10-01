'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Modal from '@/components/modal'
import { Skeleton } from '@/components/skeleton'
import { useConfirm } from '@/components/confirm-dialog'
import { useToast, networkErrorMessage } from '@/components/toast'
import { createClient } from '@/lib/supabase/client'
import {
  MAX_REPORT_BYTES,
  REPORT_ACCEPT,
  SUPPORTED_TYPES_LABEL,
  formatResult,
  isGoalkeeper,
  type ExtractedPlayerRow,
  type GameStatInput,
  type MatchConfidence,
  type RosterPlayer,
} from '@/lib/game-stats'
import {
  confirmGameReport,
  createGameReportUpload,
  deleteGameReport,
  getGameReportContext,
  saveManualStats,
  uploadAndParseGameReport,
  type GameReportContext,
  type GameReportView,
  type GameScore,
} from './game-report-actions'

interface Props {
  eventId: string
  eventTitle: string
  /** Score shown on the card right now, restored if a save fails. */
  currentScore?: GameScore | null
  onClose: () => void
  /** New score after a save (null after the stats are deleted). */
  onSaved: (score: GameScore | null) => void
}

type Phase = 'loading' | 'load-error' | 'pick' | 'reading' | 'review'
type Mode = 'draft' | 'confirmed' | 'manual'

const NUM_FIELDS = [
  'minutes', 'goals', 'assists', 'shots', 'shots_on_goal', 'yellow_cards', 'red_cards', 'saves', 'goals_against',
] as const
type NumField = (typeof NUM_FIELDS)[number]

const COLUMNS: { key: NumField; label: string; title: string }[] = [
  { key: 'minutes', label: 'Min', title: 'Minutes' },
  { key: 'goals', label: 'G', title: 'Goals' },
  { key: 'assists', label: 'A', title: 'Assists' },
  { key: 'shots', label: 'Sh', title: 'Shots' },
  { key: 'shots_on_goal', label: 'SOG', title: 'Shots on goal' },
  { key: 'yellow_cards', label: 'YC', title: 'Yellow cards' },
  { key: 'red_cards', label: 'RC', title: 'Red cards' },
  { key: 'saves', label: 'Sv', title: 'Saves (keepers)' },
  { key: 'goals_against', label: 'GA', title: 'Goals against (keepers)' },
]

interface RowSource {
  name: string
  jersey: number | null
  confidence: MatchConfidence
  reason: string
  uncertain: string[]
}

type EditRow = { key: string; player_id: string; started: boolean; source?: RowSource } & Record<NumField, string>

interface PendingRow { key: string; row: ExtractedPlayerRow }

let keySeq = 0
const nextKey = () => `r${++keySeq}`

function str(v: number | null | undefined): string {
  return v == null ? '' : String(v)
}

function rowFromExtracted(row: ExtractedPlayerRow, playerId: string, source?: RowSource): EditRow {
  return {
    key: nextKey(),
    player_id: playerId,
    started: row.started === true,
    minutes: str(row.minutes),
    goals: str(row.goals),
    assists: str(row.assists),
    shots: str(row.shots),
    shots_on_goal: str(row.shots_on_goal),
    yellow_cards: str(row.yellow_cards),
    red_cards: str(row.red_cards),
    saves: str(row.saves),
    goals_against: str(row.goals_against),
    source,
  }
}

function rowFromSaved(r: GameStatInput): EditRow {
  return {
    key: nextKey(),
    player_id: r.player_id,
    started: r.started,
    minutes: str(r.minutes),
    goals: str(r.goals),
    assists: str(r.assists),
    shots: str(r.shots),
    shots_on_goal: str(r.shots_on_goal),
    yellow_cards: str(r.yellow_cards),
    red_cards: str(r.red_cards),
    saves: str(r.saves),
    goals_against: str(r.goals_against),
  }
}

function blankRow(playerId: string): EditRow {
  return {
    key: nextKey(), player_id: playerId, started: false,
    minutes: '', goals: '', assists: '', shots: '', shots_on_goal: '',
    yellow_cards: '', red_cards: '', saves: '', goals_against: '',
  }
}

function isBlank(r: EditRow): boolean {
  return !r.started && NUM_FIELDS.every(f => r[f].trim() === '' || r[f].trim() === '0') && r.minutes.trim() === ''
}

/** Needs a second look: matched by name only, number/name disagree, or low confidence. */
function matchNeedsCheck(s: RowSource | undefined): boolean {
  if (!s) return false
  return s.confidence !== 'high' || !s.reason.startsWith('#')
}

function playerName(p: RosterPlayer | undefined): string {
  return p ? `${p.first_name} ${p.last_name}` : 'Unknown player'
}

function extractedSummary(r: ExtractedPlayerRow): string {
  const parts: string[] = []
  if (r.minutes != null) parts.push(`${r.minutes} min`)
  if (r.goals) parts.push(`${r.goals} G`)
  if (r.assists) parts.push(`${r.assists} A`)
  if (r.shots) parts.push(`${r.shots} Sh`)
  if (r.saves != null) parts.push(`${r.saves} Sv`)
  return parts.join(' · ') || 'no stats listed'
}

function opponentFromTitle(title: string): string {
  return title.replace(/^\s*(vs\.?|v\.?|@|at)\s+/i, '').trim()
}

function parseScore(v: string): number | null | 'bad' {
  const t = v.trim()
  if (t === '') return null
  const n = Number(t)
  return Number.isInteger(n) && n >= 0 && n <= 99 ? n : 'bad'
}

const cellInput =
  'w-11 bg-dark border rounded-md px-1 py-1.5 text-center text-sm text-white tabular-nums focus:outline-none focus:border-green transition-colors'

export default function GameReportModal({ eventId, eventTitle, currentScore, onClose, onSaved }: Props) {
  const { toast } = useToast()
  const { confirm: rawConfirm, dialog } = useConfirm()
  // While a confirm is up, Escape/backdrop must not close this modal too.
  const [confirming, setConfirming] = useState(false)
  async function confirm(o: Parameters<typeof rawConfirm>[0]) {
    setConfirming(true)
    try { return await rawConfirm(o) } finally { setConfirming(false) }
  }
  const fileRef = useRef<HTMLInputElement>(null)

  const [phase, setPhase] = useState<Phase>('loading')
  const [ctx, setCtx] = useState<GameReportContext | null>(null)
  const [mode, setMode] = useState<Mode>('manual')
  const [view, setView] = useState<GameReportView | null>(null)
  const [rows, setRows] = useState<EditRow[]>([])
  const [pending, setPending] = useState<PendingRow[]>([])
  const [teamScore, setTeamScore] = useState('')
  const [oppScore, setOppScore] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [showOriginal, setShowOriginal] = useState(false)
  const [showMissing, setShowMissing] = useState(false)

  const roster = useMemo(() => ctx?.roster ?? [], [ctx])
  const rosterById = useMemo(() => new Map(roster.map(p => [p.id, p])), [roster])

  function openReview(v: GameReportView | null, m: Mode, c: GameReportContext) {
    setMode(m)
    setView(v)
    setError(null)
    setShowOriginal(false)
    setShowMissing(false)
    if (m === 'manual') {
      setRows(c.roster.map(p => blankRow(p.id)))
      setPending([])
      setTeamScore('')
      setOppScore('')
    } else if (v && m === 'confirmed') {
      setRows((v.savedRows ?? []).map(rowFromSaved))
      setPending([])
      setTeamScore(str(v.teamScore))
      setOppScore(str(v.opponentScore))
    } else if (v) {
      setRows(v.matched.map(mr => rowFromExtracted(mr.row, mr.player_id, {
        name: mr.row.name,
        jersey: mr.row.jersey_number,
        confidence: mr.confidence,
        reason: mr.reason,
        uncertain: mr.row.uncertain_fields ?? [],
      })))
      setPending(v.unmatched.map(row => ({ key: nextKey(), row })))
      setTeamScore(str(v.teamScore))
      setOppScore(str(v.opponentScore))
    }
    setPhase('review')
  }

  useEffect(() => {
    let cancelled = false
    getGameReportContext(eventId)
      .then(res => {
        if (cancelled) return
        if (!res.ok) { setError(res.error); setPhase('load-error'); return }
        setCtx(res.data)
        // Reopen where staff left off: an unreviewed draft first, then the
        // saved stats for editing, else the upload screen.
        if (res.data.draft) openReview(res.data.draft, 'draft', res.data)
        else if (res.data.confirmed) openReview(res.data.confirmed, 'confirmed', res.data)
        else setPhase('pick')
      })
      .catch(() => {
        if (cancelled) return
        setError(networkErrorMessage())
        setPhase('load-error')
      })
    return () => { cancelled = true }
  }, [eventId])

  // ── Upload ────────────────────────────────────────────────────────────────

  async function handleFile(file: File) {
    if (!ctx) return
    setError(null)
    if (file.size > MAX_REPORT_BYTES) {
      setError('That file is over 10 MB. Upload a smaller copy or just the box score page.')
      return
    }
    if (ctx.confirmed) {
      const ok = await confirm({
        title: 'Replace the saved stats?',
        message: 'The stats already on player profiles stay there until you review the new report and save it.',
        confirmLabel: 'Upload new report',
      })
      if (!ok) return
    }
    setPhase('reading')
    try {
      const up = await createGameReportUpload(eventId, file.name, file.type, file.size)
      if (!up.ok) throw new Error(up.error)
      const supabase = createClient()
      const { error: upErr } = await supabase.storage
        .from('game-reports')
        .uploadToSignedUrl(up.data.path, up.data.token, file, { contentType: up.data.contentType })
      if (upErr) throw new Error(`Upload failed: ${upErr.message}`)

      const fd = new FormData()
      fd.set('storagePath', up.data.path)
      fd.set('fileName', file.name)
      fd.set('mimeType', file.type)
      const res = await uploadAndParseGameReport(eventId, fd)
      if (!res.ok) throw new Error(res.error)
      const nextCtx = { ...ctx, draft: res.data }
      setCtx(nextCtx)
      openReview(res.data, 'draft', nextCtx)
    } catch (e) {
      const msg = e instanceof Error && e.message && e.message !== 'Failed to fetch' ? e.message : networkErrorMessage()
      setError(msg)
      setPhase('pick')
    }
  }

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (f) void handleFile(f)
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragOver(false)
    const f = e.dataTransfer.files?.[0]
    if (f) void handleFile(f)
  }

  // ── Row editing ───────────────────────────────────────────────────────────

  function updateRow(key: string, patch: Partial<EditRow>) {
    setRows(rs => rs.map(r => (r.key === key ? { ...r, ...patch } : r)))
  }

  function removeRow(key: string) {
    setRows(rs => rs.filter(r => r.key !== key))
  }

  function addPlayer(playerId: string) {
    if (!playerId) return
    setRows(rs => [...rs, blankRow(playerId)])
  }

  function assignPending(p: PendingRow, playerId: string) {
    if (!playerId) return
    setPending(ps => ps.filter(x => x.key !== p.key))
    setRows(rs => [
      // A player already in the table gets replaced by the assigned row.
      ...rs.filter(r => r.player_id !== playerId),
      rowFromExtracted(p.row, playerId, {
        name: p.row.name,
        jersey: p.row.jersey_number,
        confidence: 'high',
        reason: '#assigned by staff',
        uncertain: p.row.uncertain_fields ?? [],
      }),
    ])
  }

  const usedIds = new Set(rows.map(r => r.player_id).filter(Boolean))
  const missingFromReport = mode === 'draft' ? roster.filter(p => !usedIds.has(p.id)) : []
  const notInTable = roster.filter(p => !usedIds.has(p.id))

  const nameOnlyCount = mode === 'draft' ? rows.filter(r => matchNeedsCheck(r.source)).length : 0
  const uncertainCount = mode === 'draft'
    ? rows.reduce((n, r) => n + (r.source?.uncertain.length ?? 0), 0)
    : 0
  const checkCount = mode === 'draft'
    ? nameOnlyCount + uncertainCount + pending.length + (missingFromReport.length > 0 ? 1 : 0)
    : 0

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!ctx) return
    setError(null)
    const out: GameStatInput[] = []
    const seen = new Set<string>()
    for (const r of rows) {
      if (!r.player_id) { setError('Pick a player for every row, or remove the row.'); return }
      if (mode === 'manual' && isBlank(r)) continue
      const name = playerName(rosterById.get(r.player_id))
      if (seen.has(r.player_id)) { setError(`${name} is listed twice. Remove one row.`); return }
      seen.add(r.player_id)
      const nums: Partial<Record<NumField, number | null>> = {}
      for (const f of NUM_FIELDS) {
        const t = r[f].trim()
        if (t === '') { nums[f] = null; continue }
        const n = Number(t)
        if (!Number.isInteger(n) || n < 0) {
          setError(`${name}: ${COLUMNS.find(c => c.key === f)?.title ?? f} must be a whole number.`)
          return
        }
        nums[f] = n
      }
      out.push({
        player_id: r.player_id,
        started: r.started,
        minutes: nums.minutes ?? null,
        goals: nums.goals ?? 0,
        assists: nums.assists ?? 0,
        shots: nums.shots ?? 0,
        shots_on_goal: nums.shots_on_goal ?? 0,
        yellow_cards: nums.yellow_cards ?? 0,
        red_cards: nums.red_cards ?? 0,
        saves: nums.saves ?? null,
        goals_against: nums.goals_against ?? null,
      })
    }
    const ts = parseScore(teamScore)
    const os = parseScore(oppScore)
    if (ts === 'bad' || os === 'bad') { setError('Scores must be whole numbers.'); return }
    if (out.length === 0) { setError('Add at least one player who played.'); return }

    const ours = view?.teamNameAsWritten || ctx.clubName || 'Us'
    const theirs = view?.opponentName || opponentFromTitle(ctx.event.title) || 'Opponent'
    const scoreLine = ts != null && os != null ? ` · ${ours} ${ts} - ${os} ${theirs}` : ''
    const ok = await confirm({
      title: 'Save to player profiles?',
      message: (
        <>
          <span className="block font-semibold text-white">
            {`Updates ${out.length} player${out.length === 1 ? '' : 's'}${scoreLine}`}
          </span>
          {pending.length > 0 && (
            <span className="block mt-2">{`${pending.length} unassigned row${pending.length === 1 ? ' is' : 's are'} skipped.`}</span>
          )}
          {ctx.confirmed && mode !== 'confirmed' && (
            <span className="block mt-2">This replaces the stats saved for this game.</span>
          )}
        </>
      ),
      confirmLabel: 'Save to player profiles',
    })
    if (!ok) return

    const scores: GameScore = { teamScore: ts, opponentScore: os }
    setSaving(true)
    onSaved(scores) // optimistic chip
    try {
      const res = mode === 'manual' || !view
        ? await saveManualStats(eventId, out, scores)
        : await confirmGameReport(view.reportId, out, scores)
      if (!res.ok) throw new Error(res.error)
      toast(`Saved to ${res.data.playerCount} player profile${res.data.playerCount === 1 ? '' : 's'}`, 'success')
      onSaved({ teamScore: res.data.teamScore, opponentScore: res.data.opponentScore })
      onClose()
    } catch (e) {
      onSaved(currentScore ?? null)
      const msg = e instanceof Error && e.message && e.message !== 'Failed to fetch' ? e.message : networkErrorMessage()
      setError(msg)
      toast(msg, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(target: GameReportView, isDraft: boolean) {
    const ok = await confirm(isDraft
      ? { title: 'Discard this draft?', message: 'The uploaded file and the AI reading are deleted. Saved stats are not touched.', confirmLabel: 'Discard draft', destructive: true }
      : { title: 'Delete the stats for this game?', message: 'They come off every player profile.', confirmLabel: 'Delete stats', destructive: true })
    if (!ok || !ctx) return
    setSaving(true)
    const res = await deleteGameReport(target.reportId).catch(() => ({ ok: false as const, error: networkErrorMessage() }))
    setSaving(false)
    if (!res.ok) { setError(res.error); toast(res.error, 'error'); return }
    const nextCtx: GameReportContext = isDraft ? { ...ctx, draft: null } : { ...ctx, confirmed: null }
    setCtx(nextCtx)
    if (!isDraft) onSaved(null)
    toast(isDraft ? 'Draft discarded' : 'Stats deleted', 'success')
    if (nextCtx.confirmed) openReview(nextCtx.confirmed, 'confirmed', nextCtx)
    else { setView(null); setPhase('pick') }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const wide = phase === 'review'
  const title = phase === 'review' && mode === 'manual' ? 'Enter stats' : 'Game report'

  return (
    <>
    <Modal
      title={title}
      description={eventTitle}
      onClose={onClose}
      size="lg"
      dismissible={!saving && phase !== 'reading' && !confirming}
      className={wide ? 'sm:max-w-6xl' : ''}
      bodyClassName="p-5 sm:p-7"
    >
      {phase === 'loading' && (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      )}

      {phase === 'load-error' && (
        <p className="text-sm text-red" role="alert">{error}</p>
      )}

      {phase === 'reading' && (
        <div className="py-10 text-center" aria-live="polite">
          <div className="mx-auto mb-4 h-10 w-10 rounded-full border-4 border-green/20 border-t-green animate-spin" aria-hidden="true" />
          <p className="font-bold text-white">Reading the report...</p>
          <p className="text-gray text-sm mt-1">Finding your players and their numbers. This takes up to a minute.</p>
        </div>
      )}

      {phase === 'pick' && ctx && (
        <div>
          {error && <p className="mb-4 text-sm text-red bg-red/5 border border-red/20 rounded-xl px-4 py-3" role="alert">{error}</p>}
          <div
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`rounded-2xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
              dragOver ? 'border-green bg-green/5' : 'border-white/15'
            }`}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mx-auto text-green mb-3" aria-hidden="true">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <p className="font-bold text-white">Drop the box score here</p>
            <p className="text-gray text-sm mt-1">{`${SUPPORTED_TYPES_LABEL}. Up to 10 MB.`}</p>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="mt-4 bg-green text-dark font-bold px-5 py-2.5 rounded-xl text-sm hover:opacity-90 transition-opacity"
            >
              Choose file
            </button>
            <input ref={fileRef} type="file" accept={REPORT_ACCEPT} onChange={onPick} className="hidden" />
          </div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => openReview(null, 'manual', ctx)}
              className="text-sm text-green hover:text-green/80 font-medium transition-colors"
            >
              Or enter stats manually
            </button>
            {ctx.confirmed && (
              <button
                type="button"
                onClick={() => openReview(ctx.confirmed, 'confirmed', ctx)}
                className="text-sm text-gray hover:text-white transition-colors"
              >
                Back to saved stats
              </button>
            )}
          </div>
          <p className="text-xs text-gray mt-4">
            The AI reads your team&apos;s side only. You review every number before anything reaches player profiles.
          </p>
        </div>
      )}

      {phase === 'review' && ctx && (
        <div>
          {/* Status + actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="text-sm">
              {mode === 'draft' && (
                <span className="inline-flex items-center gap-2 font-semibold text-yellow-700 bg-yellow-400/10 border border-yellow-500/25 rounded-full px-3 py-1">
                  Draft saved, not yet on player profiles
                </span>
              )}
              {mode === 'confirmed' && (
                <span className="inline-flex items-center gap-2 font-semibold text-green bg-green/10 border border-green/20 rounded-full px-3 py-1">
                  On player profiles. Edits update them when you save.
                </span>
              )}
              {mode === 'manual' && (
                <span className="text-gray">Leave a row blank for players who didn&apos;t play.</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <button type="button" onClick={() => { setError(null); setPhase('pick') }} className="text-green hover:text-green/80 transition-colors">
                {mode === 'manual' ? 'Upload a file instead' : 'Upload a different file'}
              </button>
              {mode === 'draft' && view && (
                <button type="button" disabled={saving} onClick={() => handleDelete(view, true)} className="text-gray hover:text-red transition-colors">
                  Discard draft
                </button>
              )}
              {mode === 'confirmed' && view && (
                <button type="button" disabled={saving} onClick={() => handleDelete(view, false)} className="text-gray hover:text-red transition-colors">
                  Delete stats
                </button>
              )}
            </div>
          </div>

          {mode === 'draft' && checkCount > 0 && (
            <div className="mb-4 rounded-xl border border-yellow-500/25 bg-yellow-400/10 px-4 py-3 text-sm">
              <p className="font-bold text-yellow-700">{`${checkCount} thing${checkCount === 1 ? '' : 's'} to check`}</p>
              <ul className="mt-1 text-yellow-800/90 space-y-0.5 list-disc pl-5">
                {nameOnlyCount > 0 && <li>{`${nameOnlyCount} player${nameOnlyCount === 1 ? '' : 's'} matched by name, not jersey number`}</li>}
                {uncertainCount > 0 && <li>{`${uncertainCount} number${uncertainCount === 1 ? '' : 's'} the AI wasn’t sure about (highlighted)`}</li>}
                {pending.length > 0 && <li>{`${pending.length} row${pending.length === 1 ? '' : 's'} not matched to a player`}</li>}
                {missingFromReport.length > 0 && <li>{`${missingFromReport.length} roster player${missingFromReport.length === 1 ? '' : 's'} not in the report`}</li>}
              </ul>
            </div>
          )}
          {mode === 'draft' && ctx.confirmed && (
            <p className="mb-4 text-xs text-gray">Saving replaces the stats already saved for this game.</p>
          )}

          <div className={view && (view.fileUrl || view.sourceText) ? 'lg:grid lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-5' : ''}>
            {/* Original document */}
            {view && (view.fileUrl || view.sourceText) && (
              <div className="mb-4 lg:mb-0">
                <button
                  type="button"
                  onClick={() => setShowOriginal(v => !v)}
                  aria-expanded={showOriginal}
                  className="lg:hidden mb-2 text-sm font-semibold text-green bg-green/10 border border-green/20 rounded-full px-3 py-1"
                >
                  {showOriginal ? 'Hide original' : 'View original'}
                </button>
                <div className={`${showOriginal ? 'block' : 'hidden'} lg:block rounded-xl border border-white/10 bg-dark overflow-hidden`}>
                  <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-white/10 text-xs text-gray">
                    <span className="truncate">{view.fileName ?? 'Original'}</span>
                    {view.fileUrl && (
                      <a href={view.fileUrl} target="_blank" rel="noopener noreferrer" className="text-green shrink-0">Open</a>
                    )}
                  </div>
                  {view.fileUrl && view.mimeType === 'application/pdf' && (
                    <iframe src={view.fileUrl} title="Original report" className="w-full h-[55vh] lg:h-[65vh] bg-white" />
                  )}
                  {view.fileUrl && view.mimeType?.startsWith('image/') && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={view.fileUrl} alt="Original report" className="w-full max-h-[65vh] object-contain bg-white" />
                  )}
                  {!view.fileUrl && view.sourceText && (
                    <pre className="max-h-[55vh] lg:max-h-[65vh] overflow-auto p-3 text-xs text-white/80 whitespace-pre font-mono">{view.sourceText}</pre>
                  )}
                </div>
              </div>
            )}

            <div className="min-w-0">
              {/* Score */}
              <div className="flex flex-wrap items-end gap-3 mb-4">
                <label className="block">
                  <span className="text-xs text-gray">{view?.teamNameAsWritten || ctx.clubName || 'Our score'}</span>
                  <input
                    inputMode="numeric"
                    value={teamScore}
                    onChange={e => setTeamScore(e.target.value)}
                    aria-label="Our score"
                    className="mt-1 block w-16 bg-dark border border-white/10 rounded-lg px-2 py-2 text-center text-lg font-bold text-white focus:outline-none focus:border-green"
                  />
                </label>
                <span className="pb-2.5 text-gray font-bold">-</span>
                <label className="block">
                  <span className="text-xs text-gray">{view?.opponentName || opponentFromTitle(ctx.event.title) || 'Opponent'}</span>
                  <input
                    inputMode="numeric"
                    value={oppScore}
                    onChange={e => setOppScore(e.target.value)}
                    aria-label="Opponent score"
                    className="mt-1 block w-16 bg-dark border border-white/10 rounded-lg px-2 py-2 text-center text-lg font-bold text-white focus:outline-none focus:border-green"
                  />
                </label>
                {(() => {
                  const ts = parseScore(teamScore)
                  const os = parseScore(oppScore)
                  const r = typeof ts === 'number' && typeof os === 'number' ? formatResult(ts, os) : null
                  return r ? <span className="pb-2.5 text-sm font-bold text-green">{r}</span> : null
                })()}
              </div>

              {/* Stats table */}
              <div className="overflow-x-auto -mx-1 px-1">
                <table className="w-full text-sm border-separate border-spacing-y-1">
                  <thead>
                    <tr className="text-xs text-gray text-left">
                      <th className="font-medium pr-2 min-w-[170px]">Player</th>
                      <th className="font-medium px-1 text-center" title="Started">GS</th>
                      {COLUMNS.map(c => (
                        <th key={c.key} className="font-medium px-0.5 text-center" title={c.title}>{c.label}</th>
                      ))}
                      <th aria-label="Remove" />
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map(r => {
                      const p = rosterById.get(r.player_id)
                      const gk = isGoalkeeper(p?.position)
                      const flagged = mode === 'draft' && (matchNeedsCheck(r.source) || (r.source?.uncertain.length ?? 0) > 0)
                      const otherUsed = new Set(rows.filter(x => x.key !== r.key).map(x => x.player_id))
                      return (
                        <tr key={r.key} className="align-top">
                          <td className="pr-2">
                            <div className="flex items-center gap-1.5">
                              <select
                                value={r.player_id}
                                onChange={e => updateRow(r.key, { player_id: e.target.value })}
                                aria-label="Player"
                                className={`w-full min-w-[150px] bg-dark border rounded-md px-2 py-1.5 text-sm text-white focus:outline-none focus:border-green ${
                                  mode === 'draft' && matchNeedsCheck(r.source) ? 'border-yellow-500/60' : 'border-white/10'
                                }`}
                              >
                                <option value="">Pick a player</option>
                                {roster.map(rp => (
                                  <option key={rp.id} value={rp.id} disabled={otherUsed.has(rp.id)}>
                                    {`${rp.jersey_number != null ? `#${rp.jersey_number} ` : ''}${rp.first_name} ${rp.last_name}`}
                                  </option>
                                ))}
                              </select>
                              {flagged && (
                                <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide bg-yellow-400/15 text-yellow-700 px-1.5 py-0.5 rounded">
                                  Check
                                </span>
                              )}
                            </div>
                            {mode === 'draft' && r.source && (
                              <p className="text-[11px] text-gray mt-0.5 truncate max-w-[220px]" title={`Report: ${r.source.name}`}>
                                {`Report: ${r.source.jersey != null ? `#${r.source.jersey} ` : ''}${r.source.name}`}
                                {matchNeedsCheck(r.source) ? ` · matched by ${r.source.reason}` : ''}
                              </p>
                            )}
                          </td>
                          <td className="px-1 text-center pt-2">
                            <input
                              type="checkbox"
                              checked={r.started}
                              onChange={e => updateRow(r.key, { started: e.target.checked })}
                              aria-label="Started"
                              className="h-4 w-4 accent-[var(--color-green)]"
                            />
                          </td>
                          {COLUMNS.map(c => {
                            const unsure = mode === 'draft' && (r.source?.uncertain.includes(c.key) ?? false)
                            const keeperCol = c.key === 'saves' || c.key === 'goals_against'
                            return (
                              <td key={c.key} className="px-0.5">
                                <input
                                  inputMode="numeric"
                                  value={r[c.key]}
                                  onChange={e => updateRow(r.key, { [c.key]: e.target.value } as Partial<EditRow>)}
                                  aria-label={`${c.title}, ${playerName(p)}`}
                                  placeholder={keeperCol && !gk ? '-' : ''}
                                  title={unsure ? 'The AI wasn’t sure about this number' : undefined}
                                  className={`${cellInput} ${
                                    unsure ? 'border-yellow-500 bg-yellow-400/10' : 'border-white/10'
                                  } ${keeperCol && !gk && !r[c.key] ? 'opacity-50' : ''}`}
                                />
                              </td>
                            )
                          })}
                          <td className="pl-1 pt-1">
                            <button
                              type="button"
                              onClick={() => removeRow(r.key)}
                              aria-label={`Remove ${playerName(p)}`}
                              className="p-1.5 rounded-md text-gray hover:text-red hover:bg-white/5 transition-colors"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {notInTable.length > 0 && (
                <select
                  value=""
                  onChange={e => addPlayer(e.target.value)}
                  aria-label="Add a player"
                  className="mt-2 bg-dark border border-white/10 rounded-lg px-3 py-2 text-sm text-gray focus:outline-none focus:border-green"
                >
                  <option value="">+ Add a player</option>
                  {notInTable.map(p => (
                    <option key={p.id} value={p.id}>
                      {`${p.jersey_number != null ? `#${p.jersey_number} ` : ''}${p.first_name} ${p.last_name}`}
                    </option>
                  ))}
                </select>
              )}

              {/* Unmatched rows */}
              {pending.length > 0 && (
                <div className="mt-5">
                  <p className="text-sm font-bold text-white mb-2">
                    Not matched to a player
                    <span className="ml-2 text-[10px] font-bold uppercase tracking-wide bg-yellow-400/15 text-yellow-700 px-1.5 py-0.5 rounded">Check</span>
                  </p>
                  <div className="space-y-2">
                    {pending.map(pr => (
                      <div key={pr.key} className="flex flex-wrap items-center gap-2 rounded-xl border border-yellow-500/25 bg-yellow-400/5 px-3 py-2">
                        <div className="flex-1 min-w-[160px] text-sm">
                          <span className="font-medium text-white">
                            {`${pr.row.jersey_number != null ? `#${pr.row.jersey_number} ` : ''}${pr.row.name || 'No name'}`}
                          </span>
                          <span className="text-gray text-xs ml-2">{extractedSummary(pr.row)}</span>
                        </div>
                        <select
                          value=""
                          onChange={e => assignPending(pr, e.target.value)}
                          aria-label={`Assign ${pr.row.name} to player`}
                          className="bg-dark border border-white/10 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-green"
                        >
                          <option value="">Assign to player</option>
                          {roster.map(p => (
                            <option key={p.id} value={p.id}>
                              {`${p.jersey_number != null ? `#${p.jersey_number} ` : ''}${p.first_name} ${p.last_name}${usedIds.has(p.id) ? ' (replace row)' : ''}`}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => setPending(ps => ps.filter(x => x.key !== pr.key))}
                          className="text-xs text-gray hover:text-white px-2 py-1"
                        >
                          Skip
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Roster players missing from the report */}
              {missingFromReport.length > 0 && (
                <div className="mt-5">
                  <button
                    type="button"
                    onClick={() => setShowMissing(v => !v)}
                    aria-expanded={showMissing}
                    className="text-sm font-bold text-white inline-flex items-center gap-2"
                  >
                    {`${missingFromReport.length} roster player${missingFromReport.length === 1 ? '' : 's'} not in the report`}
                    <span className="text-[10px] font-bold uppercase tracking-wide bg-yellow-400/15 text-yellow-700 px-1.5 py-0.5 rounded">Check</span>
                    <span className="text-gray font-normal text-xs">{showMissing ? 'Hide' : 'Show'}</span>
                  </button>
                  {showMissing && (
                    <ul className="mt-2 flex flex-wrap gap-2">
                      {missingFromReport.map(p => (
                        <li key={p.id}>
                          <button
                            type="button"
                            onClick={() => addPlayer(p.id)}
                            className="text-xs bg-dark border border-white/10 rounded-full px-3 py-1 text-white hover:border-green/40 transition-colors"
                          >
                            {`+ ${p.jersey_number != null ? `#${p.jersey_number} ` : ''}${p.first_name} ${p.last_name}`}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="text-xs text-gray mt-1">Usually unused subs. Add anyone who played but the report missed.</p>
                </div>
              )}

              {error && <p className="mt-4 text-sm text-red bg-red/5 border border-red/20 rounded-xl px-4 py-3" role="alert">{error}</p>}

              <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={saving}
                  className="text-sm text-gray hover:text-white px-3 py-2 transition-colors"
                >
                  {mode === 'draft' ? 'Finish later' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="bg-green text-dark font-bold px-5 py-2.5 rounded-xl text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                >
                  {saving ? 'Saving...' : 'Save to player profiles'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </Modal>
    {dialog}
    </>
  )
}
