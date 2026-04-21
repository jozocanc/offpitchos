'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { DRILL_CATEGORY_LABELS, DRILL_CATEGORIES } from '@/lib/tactics/drill-categories'
import { generateDrillFromDescription } from './ai/actions'
import type { GenerateDrillInput } from './ai/actions'

export interface GenerateModalProps {
  open: boolean
  onClose: () => void
  teams: { id: string; name: string }[]
  role: 'doc' | 'coach'
  defaultTeamId?: string
}

type DrillTypeOption = GenerateDrillInput['drillType']

const DRILL_TYPE_OPTIONS: { value: DrillTypeOption; label: string }[] = [
  { value: 'auto', label: 'Auto-detect' },
  ...DRILL_CATEGORIES.map(c => ({ value: c as DrillTypeOption, label: DRILL_CATEGORY_LABELS[c] })),
]

export default function GenerateModal({
  open,
  onClose,
  teams,
  role,
  defaultTeamId,
}: GenerateModalProps) {
  const router = useRouter()
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [description, setDescription] = useState('')
  const [drillType, setDrillType] = useState<DrillTypeOption>('auto')
  const [teamId, setTeamId] = useState<string>(defaultTeamId ?? (teams[0]?.id ?? ''))
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  if (!open) return null

  function handleClose() {
    if (isPending) return // prevent closing while generating
    setError(null)
    onClose()
  }

  function handleSubmit() {
    if (!description.trim()) {
      textareaRef.current?.focus()
      return
    }
    setError(null)

    const input: GenerateDrillInput = {
      description: description.trim(),
      drillType,
      teamId: teamId || null,
    }

    startTransition(async () => {
      try {
        const { drillId } = await generateDrillFromDescription(input)
        onClose()
        router.push(`/dashboard/tactics/${drillId}`)
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Something went wrong. Please try again.',
        )
      }
    })
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="generate-modal-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div className="w-full max-w-lg bg-dark-secondary border border-white/10 rounded-xl shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h2 id="generate-modal-title" className="text-lg font-semibold">
              Ask Pep
            </h2>
            <button
              onClick={handleClose}
              disabled={isPending}
              aria-label="Close"
              className="text-gray hover:text-white transition disabled:opacity-40 text-xl leading-none"
            >
              ×
            </button>
          </div>

          <div className="px-5 pb-5 space-y-4">
            {/* Description textarea */}
            <div>
              <label htmlFor="drill-description" className="block text-sm font-medium mb-1.5">
                Describe your drill
              </label>
              <textarea
                id="drill-description"
                ref={textareaRef}
                value={description}
                onChange={e => setDescription(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isPending}
                autoFocus
                rows={4}
                placeholder={
                  'Describe your drill in English or German — e.g., ' +
                  '"6v4 rondo in the middle third with 2 neutrals, attackers can only take 2 touches"'
                }
                className={[
                  'w-full bg-dark border rounded-lg px-3 py-2.5 text-sm resize-none',
                  'placeholder:text-gray/60 focus:outline-none focus:ring-1 focus:ring-green',
                  'disabled:opacity-50 transition',
                  'border-white/10',
                ].join(' ')}
                style={{ minHeight: 120 }}
              />
              <p className="text-xs text-gray mt-1">Tip: ⌘↵ to generate</p>
            </div>

            {/* Drill type */}
            <div>
              <label htmlFor="drill-type" className="block text-sm font-medium mb-1.5">
                Drill type
              </label>
              <select
                id="drill-type"
                value={drillType}
                onChange={e => setDrillType(e.target.value as DrillTypeOption)}
                disabled={isPending}
                className="w-full bg-dark border border-white/10 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-green disabled:opacity-50 transition"
              >
                {DRILL_TYPE_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Team picker — shown if DOC has teams */}
            {role === 'doc' && teams.length > 0 && (
              <div>
                <label htmlFor="drill-team" className="block text-sm font-medium mb-1.5">
                  Team <span className="text-gray font-normal">(optional)</span>
                </label>
                <select
                  id="drill-team"
                  value={teamId}
                  onChange={e => setTeamId(e.target.value)}
                  disabled={isPending}
                  className="w-full bg-dark border border-white/10 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-green disabled:opacity-50 transition"
                >
                  <option value="">Club-wide (no specific team)</option>
                  {teams.map(t => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Error state */}
            {error && (
              <div className="bg-red/10 border border-red/30 rounded-lg px-4 py-3 text-sm text-red">
                <p className="font-medium mb-1">Generation failed</p>
                <p className="text-red/80">{error}</p>
              </div>
            )}

            {/* Loading indicator */}
            {isPending && (
              <div className="flex items-center gap-2.5 text-sm text-gray py-1">
                <svg
                  className="animate-spin h-4 w-4 text-green flex-shrink-0"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                <span>Generating your drill… (3–6 s)</span>
              </div>
            )}

            {/* Action buttons */}
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={handleClose}
                disabled={isPending}
                className="flex-1 px-4 py-2.5 rounded-lg border border-white/10 text-sm font-medium hover:bg-white/5 transition disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={isPending || !description.trim()}
                className="flex-1 px-4 py-2.5 rounded-lg bg-green text-dark text-sm font-semibold hover:brightness-110 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isPending ? 'Generating…' : error ? 'Retry' : 'Generate ✨'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
