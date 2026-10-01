'use client'

import { useEffect, useState, useTransition } from 'react'
import { useToast } from '@/components/toast'
import { getMatchSheet, saveMatchSheet, setMatchSheetEnabled } from './match-sheet-actions'
import {
  emptyMatchSheetFields,
  MATCH_SHEET_FIELDS,
  MATCH_SHEET_LIMITS,
  type MatchSheet,
  type MatchSheetField,
  type MatchSheetFields,
} from '@/lib/match-sheet'

interface Props {
  eventId: string
  eventTitle: string
  onClose: () => void
}

const FIELD_META: Record<MatchSheetField, { label: string; placeholder: string; multiline: boolean }> = {
  arrival_notes: { label: 'Arrival', placeholder: 'Arrive 60 min before kickoff. Warm up on the east grass.', multiline: true },
  parking: { label: 'Parking', placeholder: 'Bus drops at the north gate. Park in Lot C.', multiline: true },
  locker_room: { label: 'Locker room', placeholder: 'Visitors locker room, field house, door 2.', multiline: false },
  home_kit: { label: 'Home team wears', placeholder: 'Black and gold', multiline: false },
  contact_name: { label: 'Day-of contact', placeholder: 'Coach Stocker', multiline: false },
  contact_phone: { label: 'Contact phone', placeholder: '(903) 555-0123', multiline: false },
  extra_notes: { label: 'Anything else', placeholder: 'Trainer on site. Water provided at the bench.', multiline: true },
}

const inputClass =
  'w-full bg-dark border border-white/10 rounded-xl px-4 py-2.5 text-white text-sm focus:outline-none focus:border-green transition-colors'

export default function VisitorInfoModal({ eventId, eventTitle, onClose }: Props) {
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [fields, setFields] = useState<MatchSheetFields>(emptyMatchSheetFields)
  const [sheet, setSheet] = useState<MatchSheet | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    let cancelled = false
    getMatchSheet(eventId).then(res => {
      if (cancelled) return
      if (!res.ok) {
        setError(res.error)
      } else if (res.data) {
        setSheet(res.data)
        const next = {} as MatchSheetFields
        for (const f of MATCH_SHEET_FIELDS) next[f] = res.data[f]
        setFields(next)
      }
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [eventId])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const shareUrl = sheet && typeof window !== 'undefined'
    ? `${window.location.origin}/match/${sheet.token}`
    : null

  function handleSave() {
    setError(null)
    startTransition(async () => {
      const res = await saveMatchSheet(eventId, fields)
      if (!res.ok) { setError(res.error); return }
      setSheet(res.data)
      toast('Visitor info saved')
    })
  }

  function handleToggle() {
    if (!sheet) return
    setError(null)
    const next = !sheet.enabled
    startTransition(async () => {
      const res = await setMatchSheetEnabled(eventId, next)
      if (!res.ok) { setError(res.error); return }
      setSheet(res.data)
      toast(next ? 'Link turned on' : 'Link turned off')
    })
  }

  async function handleCopy() {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      toast('Could not copy. Select the link and copy it manually.', 'error')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-dark-secondary rounded-2xl p-6 sm:p-8 w-full max-w-lg border border-white/10 shadow-2xl my-8 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 mb-1">
          <h2 className="text-xl font-bold">Visitor info</h2>
          <button onClick={onClose} className="text-gray hover:text-white text-sm transition-colors" aria-label="Close">
            Close
          </button>
        </div>
        <p className="text-gray text-sm mb-5">
          A public page for the visiting coach of <span className="text-white font-medium">{eventTitle}</span>. No login needed. Text or email them the link.
        </p>

        {loading ? (
          <p className="text-gray text-sm py-8 text-center">Loading…</p>
        ) : (
          <>
            {sheet && shareUrl && (
              <div className="mb-6 rounded-xl border border-green/20 bg-green/5 p-4">
                <div className="flex items-center justify-between gap-3 mb-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-green">Shareable link</p>
                  <label className="inline-flex items-center gap-2 text-xs text-gray cursor-pointer select-none">
                    <span>{sheet.enabled ? 'Link on' : 'Link off'}</span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={sheet.enabled}
                      disabled={pending}
                      onClick={handleToggle}
                      className={`relative w-9 h-5 rounded-full transition-colors disabled:opacity-50 ${sheet.enabled ? 'bg-green' : 'bg-gray/40'}`}
                    >
                      <span
                        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-dark-secondary shadow transition-transform ${sheet.enabled ? 'translate-x-4' : ''}`}
                      />
                    </button>
                  </label>
                </div>
                <input
                  readOnly
                  value={shareUrl}
                  onFocus={e => e.currentTarget.select()}
                  className={`${inputClass} font-mono text-xs ${sheet.enabled ? '' : 'opacity-50'}`}
                />
                {!sheet.enabled && (
                  <p className="text-xs text-gray mt-2">The link is off. Visitors see a &quot;not available&quot; page until you turn it back on.</p>
                )}
                <div className="flex gap-2 mt-3">
                  <button
                    type="button"
                    onClick={handleCopy}
                    className="bg-green text-dark text-xs font-bold px-4 py-2 rounded-full hover:opacity-90 transition-opacity"
                  >
                    {copied ? 'Copied' : 'Copy link'}
                  </button>
                  <a
                    href={`/match/${sheet.token}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-green text-xs font-bold px-4 py-2 rounded-full border border-green/30 hover:bg-green/10 transition-colors"
                  >
                    Preview
                  </a>
                </div>
              </div>
            )}

            <div className="space-y-4">
              {MATCH_SHEET_FIELDS.map(f => {
                const meta = FIELD_META[f]
                return (
                  <div key={f}>
                    <label htmlFor={`ms-${f}`} className="block text-sm font-medium text-gray mb-1.5">
                      {meta.label}
                    </label>
                    {meta.multiline ? (
                      <textarea
                        id={`ms-${f}`}
                        rows={2}
                        value={fields[f]}
                        maxLength={MATCH_SHEET_LIMITS[f]}
                        placeholder={meta.placeholder}
                        onChange={e => setFields(prev => ({ ...prev, [f]: e.target.value }))}
                        className={`${inputClass} resize-y`}
                      />
                    ) : (
                      <input
                        id={`ms-${f}`}
                        type={f === 'contact_phone' ? 'tel' : 'text'}
                        value={fields[f]}
                        maxLength={MATCH_SHEET_LIMITS[f]}
                        placeholder={meta.placeholder}
                        onChange={e => setFields(prev => ({ ...prev, [f]: e.target.value }))}
                        className={inputClass}
                      />
                    )}
                    {f === 'home_kit' && (
                      <p className="text-xs text-gray mt-1">Shown as: Home team wears X. Please bring a contrasting kit.</p>
                    )}
                  </div>
                )
              })}
            </div>

            {error && <p className="text-red text-sm mt-4">{error}</p>}

            <div className="flex justify-end gap-3 mt-6">
              <button onClick={onClose} className="text-gray hover:text-white text-sm px-4 py-2 transition-colors">
                {sheet ? 'Done' : 'Cancel'}
              </button>
              <button
                onClick={handleSave}
                disabled={pending}
                className="bg-green text-dark text-sm font-bold px-5 py-2 rounded-full hover:opacity-90 transition-opacity disabled:opacity-50"
              >
                {pending ? 'Saving…' : sheet ? 'Save changes' : 'Save and get link'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
