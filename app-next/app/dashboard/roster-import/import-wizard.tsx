'use client'

import { useState, useTransition } from 'react'
import Papa from 'papaparse'
import { previewImport, commitImport } from './actions'
import { suggestMapping } from './lib/se-column-aliases'
import {
  ColumnMapping,
  ParsedRow,
  PreviewResult,
  OffPitchField,
  REQUIRED_FIELDS,
} from './lib/types'

type Step = 'upload' | 'map' | 'preview' | 'success'

const ALL_FIELDS: OffPitchField[] = [
  'player_first_name',
  'player_last_name',
  'team_name',
  'team_age_group',
  'parent1_email',
  'parent1_first_name',
  'parent1_phone',
  'parent2_email',
  'jersey_number',
  'position',
  'date_of_birth',
]

export default function ImportWizard({
  variant,
  onComplete,
}: {
  variant: 'onboarding' | 'dashboard'
  onComplete?: () => void
}) {
  const [step, setStep] = useState<Step>('upload')
  const [headers, setHeaders] = useState<string[]>([])
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [mapping, setMapping] = useState<ColumnMapping>({})
  const [preview, setPreview] = useState<Extract<PreviewResult, { ok: true }>['data'] | null>(null)
  const [success, setSuccess] = useState<{
    teamsCreated: number
    playersCreated: number
    parentsCreated: number
    parentUserIds: string[]
  } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleFile(file: File) {
    setError(null)
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.errors.length > 0) {
          setError(`CSV parse error: ${results.errors[0].message}`)
          return
        }
        const parsedRows: ParsedRow[] = results.data.map((raw, i) => ({
          raw,
          rowNumber: i + 2, // header is row 1 in user's mental model
        }))
        if (parsedRows.length === 0) {
          setError('CSV has no data rows')
          return
        }
        const csvHeaders = results.meta.fields ?? []
        setHeaders(csvHeaders)
        setRows(parsedRows)
        setMapping(suggestMapping(csvHeaders))
        setStep('map')
      },
      error: (err) => setError(`Could not parse CSV: ${err.message}`),
    })
  }

  function handlePreview() {
    setError(null)
    startTransition(async () => {
      const res = await previewImport(rows, mapping, variant)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setPreview(res.data)
      setStep('preview')
    })
  }

  function handleConfirm() {
    setError(null)
    startTransition(async () => {
      const res = await commitImport(rows, mapping, variant)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setSuccess(res.data)
      setStep('success')
    })
  }

  // ---- RENDER ----

  if (step === 'upload') {
    return (
      <div className="w-full max-w-xl mx-auto">
        <div className="bg-dark-secondary rounded-2xl p-8 shadow-lg">
          <h2 className="text-xl font-bold mb-1">Import roster</h2>
          <p className="text-gray text-sm mb-6">
            Upload a CSV from SportsEngine, TeamSnap, GotSport, or any spreadsheet. We&apos;ll auto-map known column names.
          </p>
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
            className="block w-full text-white text-sm file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-green file:text-dark file:font-bold file:cursor-pointer hover:file:opacity-90"
          />
          {error && <p className="text-red text-sm mt-4">{error}</p>}
          {variant === 'onboarding' && onComplete && (
            <button onClick={onComplete} className="mt-6 text-gray text-sm underline hover:text-white transition-colors">
              Skip for now
            </button>
          )}
        </div>
      </div>
    )
  }

  if (step === 'map') {
    const requiredMissing = REQUIRED_FIELDS.filter(
      f => !Object.values(mapping).includes(f)
    )
    return (
      <div className="w-full max-w-2xl mx-auto">
        <div className="bg-dark-secondary rounded-2xl p-8 shadow-lg">
          <h2 className="text-xl font-bold mb-1">Map columns</h2>
          <p className="text-gray text-sm mb-6">
            We&apos;ve matched what we recognized. Adjust any that look wrong.
          </p>
          <div className="space-y-3">
            {headers.map(h => (
              <div key={h} className="grid grid-cols-2 gap-4 items-center">
                <div className="text-white text-sm">{h}</div>
                <select
                  value={mapping[h] ?? ''}
                  onChange={(e) => setMapping({ ...mapping, [h]: e.target.value as OffPitchField | '' })}
                  className="w-full bg-dark border border-white/10 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-green transition-colors appearance-none"
                >
                  <option value="">— don&apos;t import —</option>
                  {ALL_FIELDS.map(f => (
                    <option key={f} value={f}>
                      {f}{REQUIRED_FIELDS.includes(f) ? ' *' : ''}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
          {requiredMissing.length > 0 && (
            <p className="text-red text-sm mt-4">
              Required fields not mapped: {requiredMissing.join(', ')}
            </p>
          )}
          {error && <p className="text-red text-sm mt-4">{error}</p>}
          <div className="mt-6 flex items-center gap-4">
            <button
              onClick={() => setStep('upload')}
              className="text-gray text-sm hover:text-white transition-colors"
            >
              &larr; Back
            </button>
            <button
              onClick={handlePreview}
              disabled={requiredMissing.length > 0 || isPending}
              className="ml-auto bg-green text-dark font-bold px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? 'Validating…' : 'Continue to preview'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'preview' && preview) {
    return (
      <div className="w-full max-w-2xl mx-auto">
        <div className="bg-dark-secondary rounded-2xl p-8 shadow-lg">
          <h2 className="text-xl font-bold mb-4">Preview</h2>
          <div className="bg-dark border border-white/10 rounded-xl p-4 mb-4 space-y-1 text-sm text-white">
            <p>{preview.counts.newTeams} new teams</p>
            <p>{preview.counts.newPlayers} new players</p>
            <p>{preview.counts.uniqueParentEmails} parents (one account per unique email — siblings share)</p>
            {preview.skippedRows > 0 && (
              <p className="text-yellow-400">{preview.skippedRows} rows will be skipped</p>
            )}
          </div>
          {preview.siblingGroups.length > 0 && (
            <div className="bg-dark border border-white/10 rounded-xl p-4 mb-4">
              <p className="font-semibold mb-2 text-white text-sm">Siblings detected:</p>
              <div className="space-y-1">
                {preview.siblingGroups.map(g => (
                  <p key={g.email} className="text-sm text-gray">{g.email} — {g.playerCount} players</p>
                ))}
              </div>
            </div>
          )}
          {preview.warnings.length > 0 && (
            <details className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4 mb-4">
              <summary className="cursor-pointer text-yellow-400 text-sm font-semibold">
                {preview.warnings.length} warnings
              </summary>
              <ul className="mt-2 text-sm space-y-1 text-gray">
                {preview.warnings.map((w, i) => (
                  <li key={i}>Row {w.rowNumber}: {w.message}</li>
                ))}
              </ul>
            </details>
          )}
          {preview.blockingErrors.length > 0 && (
            <div className="bg-red/10 border border-red/40 rounded-xl p-4 mb-4 space-y-1 text-sm text-red">
              {preview.blockingErrors.map((e, i) => <p key={i}>{e.message}</p>)}
            </div>
          )}
          {error && <p className="text-red text-sm mt-4">{error}</p>}
          <div className="mt-6 flex items-center gap-4">
            <button
              onClick={() => setStep('map')}
              className="text-gray text-sm hover:text-white transition-colors"
            >
              &larr; Back to mapping
            </button>
            <button
              onClick={handleConfirm}
              disabled={preview.blockingErrors.length > 0 || isPending}
              className="ml-auto bg-green text-dark font-bold px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? 'Importing…' : `Confirm import (${preview.counts.newPlayers} players)`}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'success' && success) {
    return (
      <div className="w-full max-w-xl mx-auto">
        <div className="bg-dark-secondary rounded-2xl p-8 shadow-lg text-center">
          <h2 className="text-xl font-bold mb-4">Import complete ✓</h2>
          <p className="text-white text-sm mb-2">
            {success.teamsCreated} teams · {success.playersCreated} players · {success.parentsCreated} parents created
          </p>
          <p className="text-gray text-sm mb-6">
            Parent accounts are created but no emails have been sent yet. Use &ldquo;Send invites&rdquo; (coming next phase) to email them their password-set links.
          </p>
          {variant === 'onboarding' && onComplete && (
            <button
              onClick={onComplete}
              className="bg-green text-dark font-bold px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity"
            >
              Continue to dashboard
            </button>
          )}
          {variant === 'dashboard' && (
            <a href="/dashboard/teams" className="text-green underline hover:opacity-90 transition-opacity">
              View teams &rarr;
            </a>
          )}
        </div>
      </div>
    )
  }

  return null
}
