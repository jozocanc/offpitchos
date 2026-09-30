'use client'

import { useState, useTransition } from 'react'
import { submitCheckin } from './actions'
import {
  CHECKIN_NOTE_MAX,
  CHECKIN_STATUSES,
  CHECKIN_STATUS_LABELS,
  type CheckinRow,
  type CheckinStatus,
} from '@/lib/checkin'
import { useToast } from '@/components/toast'

const SCALES = [
  { key: 'sleep', label: 'Sleep', low: 'Poor', high: 'Great' },
  { key: 'soreness', label: 'Soreness', low: 'Fresh', high: 'Very sore' },
  { key: 'energy', label: 'Energy', low: 'Low', high: 'High' },
] as const

type ScaleKey = (typeof SCALES)[number]['key']

const STATUS_STYLES: Record<CheckinStatus, { on: string; chip: string }> = {
  fit: {
    on: 'bg-green text-dark-secondary border-green',
    chip: 'bg-green/10 text-green',
  },
  limited: {
    on: 'bg-amber-400 text-white border-amber-400',
    chip: 'bg-amber-500/15 text-amber-800',
  },
  out: {
    on: 'bg-red-600 text-dark-secondary border-red-600',
    chip: 'bg-red-500/10 text-red-700',
  },
}

export function CheckinStatusChip({ status }: { status: CheckinStatus }) {
  return (
    <span className={`inline-flex items-center text-xs font-bold px-2 py-0.5 rounded-full ${STATUS_STYLES[status].chip}`}>
      {CHECKIN_STATUS_LABELS[status]}
    </span>
  )
}

/**
 * Morning check-in: three 1-5 rows, an availability call and an optional
 * note. Used both as the dashboard card (variant "card") and on
 * /dashboard/check-in (variant "page", the push deep link).
 */
export default function CheckinForm({
  initial,
  firstName,
  isPreview,
  variant,
}: {
  initial: CheckinRow | null
  firstName: string
  isPreview: boolean
  variant: 'card' | 'page'
}) {
  const { toast } = useToast()
  const [saved, setSaved] = useState<CheckinRow | null>(initial)
  const [editing, setEditing] = useState(initial === null)
  const [values, setValues] = useState<Record<ScaleKey, number | null>>({
    sleep: initial?.sleep ?? null,
    soreness: initial?.soreness ?? null,
    energy: initial?.energy ?? null,
  })
  const [status, setStatus] = useState<CheckinStatus | null>(initial?.status ?? null)
  const [note, setNote] = useState(initial?.note ?? '')
  const [showNote, setShowNote] = useState(Boolean(initial?.note))
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const complete = values.sleep !== null && values.soreness !== null && values.energy !== null && status !== null

  function submit() {
    if (!complete || status === null) {
      setError('Tap a number on each row and pick your availability.')
      return
    }
    setError(null)
    startTransition(async () => {
      const res = await submitCheckin({
        sleep: values.sleep as number,
        soreness: values.soreness as number,
        energy: values.energy as number,
        status,
        note: note.trim() || null,
      })
      if (!res.ok) {
        setError(res.error)
        toast(res.error, 'error')
        return
      }
      setSaved(res.data)
      setEditing(false)
      toast('Checked in. Thanks.', 'success')
    })
  }

  // Compact summary once today's check-in exists.
  if (saved && !editing) {
    return (
      <div className={variant === 'card' ? 'mb-10' : ''}>
        <div className="bg-dark-secondary rounded-2xl border border-white/5 p-4 sm:p-5 flex items-center gap-4">
          <span className="w-10 h-10 rounded-full bg-green/10 text-green flex items-center justify-center shrink-0" aria-hidden>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold text-sm">Checked in today</p>
              <CheckinStatusChip status={saved.status} />
            </div>
            <p className="text-gray text-xs mt-1 tabular-nums">
              Sleep {saved.sleep} · Soreness {saved.soreness} · Energy {saved.energy}
            </p>
            {saved.note && <p className="text-gray text-xs mt-1 truncate">&ldquo;{saved.note}&rdquo;</p>}
          </div>
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-xs font-bold text-green px-3 py-2 rounded-lg hover:bg-green/10 transition-colors shrink-0"
          >
            Edit
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={variant === 'card' ? 'mb-10' : ''}>
      <div className="bg-dark-secondary rounded-2xl border border-green/20 p-4 sm:p-6">
        <div className="flex items-start justify-between gap-3 mb-5">
          <div>
            <h2 className="text-lg font-bold">Morning check-in</h2>
            <p className="text-gray text-sm mt-0.5">
              {saved ? 'Update today’s answers.' : `10 seconds, ${firstName}: how did you sleep and how do you feel?`}
            </p>
          </div>
        </div>

        <div className="space-y-5">
          {SCALES.map(scale => (
            <div key={scale.key}>
              <div className="flex items-baseline justify-between mb-2">
                <p className="text-sm font-bold">{scale.label}</p>
              </div>
              <div className="grid grid-cols-5 gap-2" role="radiogroup" aria-label={scale.label}>
                {[1, 2, 3, 4, 5].map(n => {
                  const on = values[scale.key] === n
                  return (
                    <button
                      key={n}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => setValues(v => ({ ...v, [scale.key]: n }))}
                      className={`h-12 rounded-xl border text-base font-bold tabular-nums transition-colors ${
                        on
                          ? 'bg-green text-dark-secondary border-green'
                          : 'bg-dark border-white/10 text-white hover:border-green/40'
                      }`}
                    >
                      {n}
                    </button>
                  )
                })}
              </div>
              <div className="flex justify-between mt-1 text-[11px] text-gray">
                <span>{scale.low}</span>
                <span>{scale.high}</span>
              </div>
            </div>
          ))}

          <div>
            <p className="text-sm font-bold mb-2">Availability</p>
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Availability">
              {CHECKIN_STATUSES.map(s => {
                const on = status === s
                return (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setStatus(s)}
                    className={`h-12 rounded-xl border text-sm font-bold transition-colors ${
                      on ? STATUS_STYLES[s].on : 'bg-dark border-white/10 text-white hover:border-green/40'
                    }`}
                  >
                    {CHECKIN_STATUS_LABELS[s]}
                  </button>
                )
              })}
            </div>
          </div>

          {showNote ? (
            <div>
              <label htmlFor="checkin-note" className="text-sm font-bold block mb-2">
                Note for the staff <span className="text-gray font-normal">(optional, private)</span>
              </label>
              <textarea
                id="checkin-note"
                value={note}
                onChange={e => setNote(e.target.value.slice(0, CHECKIN_NOTE_MAX))}
                rows={2}
                maxLength={CHECKIN_NOTE_MAX}
                placeholder="Tight hamstring, exam week, anything the staff should know"
                className="w-full bg-dark border border-white/10 rounded-xl px-3 py-2.5 text-base sm:text-sm text-white placeholder:text-gray/70 focus:outline-none focus:border-green/40"
              />
              <p className="text-[11px] text-gray text-right mt-1 tabular-nums">{note.length}/{CHECKIN_NOTE_MAX}</p>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowNote(true)}
              className="text-sm font-bold text-green hover:opacity-80"
            >
              + Add a note for the staff
            </button>
          )}

          {error && <p className="text-sm text-red-700 bg-red-500/10 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-2">
            {saved && (
              <button
                type="button"
                onClick={() => { setEditing(false); setError(null) }}
                className="h-12 px-5 rounded-xl border border-white/10 text-sm font-bold text-gray hover:text-white"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className={`flex-1 h-12 rounded-xl text-base font-bold transition-opacity ${
                complete ? 'bg-green text-dark-secondary hover:opacity-90' : 'bg-green/30 text-dark-secondary'
              } disabled:opacity-60`}
            >
              {pending ? 'Saving...' : saved ? 'Save changes' : 'Submit'}
            </button>
          </div>

          {isPreview && (
            <p className="text-[11px] text-gray text-center">Preview: submitting is disabled while viewing as a player.</p>
          )}
        </div>
      </div>
    </div>
  )
}
