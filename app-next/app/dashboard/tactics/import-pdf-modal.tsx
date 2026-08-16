'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { generateDrillFromPdf } from './ai/actions'

export interface ImportPdfModalProps {
  open: boolean
  onClose: () => void
  teams: { id: string; name: string }[]
  role: 'doc' | 'coach'
  defaultTeamId?: string
}

type Phase = 'idle' | 'reading' | 'analyzing'

export default function ImportPdfModal({
  open,
  onClose,
  teams,
  role,
  defaultTeamId,
}: ImportPdfModalProps) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [teamId, setTeamId] = useState<string>(defaultTeamId ?? (teams[0]?.id ?? ''))
  const [phase, setPhase] = useState<Phase>('idle')
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (!open) return null

  const isPending = phase !== 'idle'

  function handleClose() {
    if (isPending) return
    setFile(null)
    setError(null)
    onClose()
  }

  function pickFile(f: File | null | undefined) {
    if (!f) return
    if (f.type !== 'application/pdf' && !f.name.toLowerCase().endsWith('.pdf')) {
      setError('Please choose a PDF file.')
      return
    }
    setError(null)
    setFile(f)
  }

  async function handleSubmit() {
    if (!file) {
      fileInputRef.current?.click()
      return
    }
    setError(null)
    try {
      setPhase('reading')
      const { extractPdfPages } = await import('@/lib/tactics/pdf-extract')
      const pages = await extractPdfPages(file)

      setPhase('analyzing')
      const res = await generateDrillFromPdf({
        pages: pages.map(p => ({ pngDataUrl: p.pngDataUrl, text: p.text })),
        teamId: teamId || null,
      })
      if (!res.ok) { setPhase('idle'); setError(res.error); return }
      onClose()
      router.push(`/dashboard/tactics/${res.data.drillId}`)
    } catch (err) {
      setPhase('idle')
      setError(
        err instanceof Error ? err.message : 'Something went wrong. Please try again.',
      )
    }
  }

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
        aria-hidden="true"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="import-pdf-modal-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div className="w-full max-w-lg bg-dark-secondary border border-white/10 rounded-xl shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <h2 id="import-pdf-modal-title" className="text-lg font-semibold">
              Import drill from PDF
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
            <p className="text-sm text-gray">
              Upload a coaching drill PDF — diagram and notes — and it&apos;s
              reproduced on a new tactics board you can edit.
            </p>

            {/* Drop zone */}
            <div
              onClick={() => !isPending && fileInputRef.current?.click()}
              onDragOver={e => {
                e.preventDefault()
                if (!isPending) setDragOver(true)
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => {
                e.preventDefault()
                setDragOver(false)
                if (!isPending) pickFile(e.dataTransfer.files?.[0])
              }}
              className={[
                'rounded-lg border border-dashed px-4 py-8 text-center transition',
                isPending ? 'opacity-50' : 'cursor-pointer hover:border-white/30',
                dragOver ? 'border-green bg-green/5' : 'border-white/15',
              ].join(' ')}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="application/pdf,.pdf"
                className="hidden"
                onChange={e => pickFile(e.target.files?.[0])}
              />
              {file ? (
                <div className="text-sm">
                  <p className="font-medium text-white truncate">{file.name}</p>
                  <p className="text-gray mt-0.5">Click to choose a different file</p>
                </div>
              ) : (
                <div className="text-sm text-gray">
                  <p className="font-medium text-white">Drop a PDF here</p>
                  <p className="mt-0.5">or click to browse</p>
                </div>
              )}
            </div>

            {/* Team picker — shown if DOC has teams */}
            {role === 'doc' && teams.length > 0 && (
              <div>
                <label htmlFor="import-team" className="block text-sm font-medium mb-1.5">
                  Team <span className="text-gray font-normal">(optional)</span>
                </label>
                <select
                  id="import-team"
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
                <p className="font-medium mb-1">Import failed</p>
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
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span>
                  {phase === 'reading'
                    ? 'Reading PDF…'
                    : 'Analyzing PDF and building your board… (up to ~30 s)'}
                </span>
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
                disabled={isPending || !file}
                className="flex-1 px-4 py-2.5 rounded-lg bg-green text-dark text-sm font-semibold hover:brightness-110 transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isPending ? 'Working…' : error ? 'Retry' : 'Import drill'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
