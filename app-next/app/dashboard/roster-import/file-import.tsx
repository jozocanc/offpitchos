'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { readRosterFile, saveRosterRows } from './file-actions'
import type { RosterDraftRow, RosterField, RosterReadResult, RosterSaveResult } from './lib/file-types'
import { IMPORT_ACCEPT, IMPORT_TYPES_LABEL, MAX_IMPORT_BYTES } from '@/lib/import-files'

/** Phone photos are often 3-8 MB; shrink big images so they fit the upload cap. */
async function shrinkImage(file: File): Promise<File> {
  if (!file.type.startsWith('image/') || file.type === 'image/gif' || file.size <= 1.5 * 1024 * 1024) return file
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>(res => canvas.toBlob(res, 'image/jpeg', 0.85))
    if (!blob) return file
    return new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' })
  } catch {
    return file
  }
}

type Step = 'upload' | 'reading' | 'review' | 'done'

const COLS: { field: RosterField; label: string; width: string }[] = [
  { field: 'jersey_number', label: '#', width: 'w-14' },
  { field: 'first_name', label: 'First name', width: 'w-36' },
  { field: 'last_name', label: 'Last name', width: 'w-36' },
  { field: 'position', label: 'Position', width: 'w-24' },
  { field: 'date_of_birth', label: 'Birthday', width: 'w-32' },
]

function status(r: RosterDraftRow): 'new' | 'update' | 'same' {
  if (!r.matchId) return 'new'
  return r.changes.length > 0 ? 'update' : 'same'
}

export default function FileImport({
  teams,
  onDone,
}: {
  /** The club's teams. With one (or none passed), the server picks the only team. */
  teams?: { id: string; name: string }[]
  onDone?: () => void
}) {
  const [step, setStep] = useState<Step>('upload')
  const [teamId, setTeamId] = useState(teams?.length === 1 ? teams[0].id : '')
  const [result, setResult] = useState<RosterReadResult | null>(null)
  const [rows, setRows] = useState<RosterDraftRow[]>([])
  const [saved, setSaved] = useState<RosterSaveResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, startSaving] = useTransition()
  const needsTeam = (teams?.length ?? 0) > 1

  async function handleFile(original: File) {
    setError(null)
    if (needsTeam && !teamId) {
      setError('Choose which team this roster is for first.')
      return
    }
    const file = await shrinkImage(original)
    if (file.size > MAX_IMPORT_BYTES) {
      setError('That file is over 4 MB. Upload a smaller copy, a screenshot, or just the roster page.')
      return
    }
    setStep('reading')
    const fd = new FormData()
    fd.set('file', file)
    if (teamId) fd.set('teamId', teamId)
    const res = await readRosterFile(fd)
    if (!res.ok) {
      setError(res.error)
      setStep('upload')
      return
    }
    setResult(res.data)
    setRows(res.data.rows)
    setStep('review')
  }

  function update(key: string, patch: Partial<RosterDraftRow>) {
    setRows(rs => rs.map(r => (r.key === key ? { ...r, ...patch } : r)))
  }

  function handleSave() {
    if (!result) return
    setError(null)
    startSaving(async () => {
      const res = await saveRosterRows(result.teamId, rows)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setSaved(res.data)
      setStep('done')
    })
  }

  if (step === 'upload' || step === 'reading') {
    const reading = step === 'reading'
    return (
      <div className="w-full max-w-xl mx-auto">
        <div className="bg-dark-secondary rounded-2xl p-6 md:p-8 shadow-lg">
          <h2 className="text-xl font-bold mb-1">Import roster</h2>
          <p className="text-gray text-sm mb-6">
            Upload your roster in any format: {IMPORT_TYPES_LABEL}. A screenshot of the athletics website works
            too. You check every player before anything is saved.
          </p>
          {needsTeam && (
            <select
              value={teamId}
              onChange={e => setTeamId(e.target.value)}
              disabled={reading}
              className="w-full mb-4 bg-dark border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-green"
            >
              <option value="">Which team is this roster for?</option>
              {teams!.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          {reading ? (
            <div className="bg-dark border border-white/10 rounded-xl p-5 text-sm">
              <p className="text-white font-semibold">Reading your roster…</p>
              <p className="text-gray mt-1">This usually takes 20 to 60 seconds. Keep this page open.</p>
            </div>
          ) : (
            <label className="block cursor-pointer bg-dark border-2 border-dashed border-white/15 hover:border-green rounded-xl p-6 text-center transition-colors">
              <span className="text-green font-bold">Choose a file</span>
              <span className="block text-gray text-xs mt-1">or take a photo of the printed roster</span>
              <input
                type="file"
                accept={IMPORT_ACCEPT}
                className="sr-only"
                onChange={e => {
                  const f = e.target.files?.[0]
                  e.target.value = ''
                  if (f) handleFile(f)
                }}
              />
            </label>
          )}
          {error && <p className="text-red text-sm mt-4">{error}</p>}
          {onDone && !reading && (
            <button onClick={onDone} className="mt-6 text-gray text-sm underline hover:text-white transition-colors">
              Skip for now
            </button>
          )}
        </div>
      </div>
    )
  }

  if (step === 'review' && result) {
    const counts = { new: 0, update: 0, same: 0 }
    for (const r of rows) if (r.include) counts[status(r)]++
    const flagged = rows.filter(r => r.include && r.uncertain.length > 0).length
    const toSave = counts.new + counts.update

    return (
      <div className="w-full">
        <div className="bg-dark-secondary rounded-2xl p-4 md:p-6 shadow-lg">
          <h2 className="text-xl font-bold mb-1">Check the roster for {result.teamName}</h2>
          <p className="text-gray text-sm mb-4">
            {rows.length} players read from the file. Fix anything that looks wrong, untick anyone you don&apos;t want,
            then save.
            {result.existingCount > 0 && ' Players already on your roster are matched and only updated where the file has something new.'}
          </p>

          <div className="flex flex-wrap gap-2 mb-4 text-xs">
            <span className="bg-green/10 text-green border border-green/20 px-2 py-1 rounded-full font-bold">{counts.new} new</span>
            {counts.update > 0 && (
              <span className="bg-blue-400/10 text-blue-300 border border-blue-400/20 px-2 py-1 rounded-full font-bold">{counts.update} to update</span>
            )}
            {counts.same > 0 && (
              <span className="bg-white/5 text-gray border border-white/10 px-2 py-1 rounded-full font-bold">{counts.same} already up to date</span>
            )}
            {flagged > 0 && (
              <span className="bg-yellow-400/10 text-yellow-400 border border-yellow-400/20 px-2 py-1 rounded-full font-bold">
                {flagged} to double-check (yellow)
              </span>
            )}
          </div>

          <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
            <table className="min-w-[760px] w-full text-sm">
              <thead>
                <tr className="text-left text-gray text-xs uppercase tracking-wider">
                  <th className="py-2 pr-2 w-8" />
                  <th className="py-2 pr-2 w-28">Status</th>
                  {COLS.map(c => <th key={c.field} className={`py-2 pr-2 ${c.width}`}>{c.label}</th>)}
                  <th className="py-2 pr-2">Notes (new players)</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => {
                  const s = status(r)
                  return (
                    <tr key={r.key} className={`border-t border-white/5 ${r.include ? '' : 'opacity-40'}`}>
                      <td className="py-2 pr-2">
                        <input
                          type="checkbox"
                          checked={r.include}
                          onChange={e => update(r.key, { include: e.target.checked })}
                          aria-label={`Include ${r.first_name} ${r.last_name}`}
                          className="w-4 h-4 accent-green"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        {s === 'new' && <span className="text-green text-xs font-bold">New</span>}
                        {s === 'update' && <span className="text-blue-300 text-xs font-bold" title={`Updates ${r.matchLabel}`}>Update</span>}
                        {s === 'same' && <span className="text-gray text-xs font-bold" title={r.matchLabel ?? ''}>On roster</span>}
                      </td>
                      {COLS.map(c => {
                        const unsure = r.uncertain.includes(c.field)
                        const changed = r.changes.includes(c.field)
                        return (
                          <td key={c.field} className="py-1.5 pr-2">
                            <input
                              value={r[c.field]}
                              onChange={e => update(r.key, { [c.field]: e.target.value })}
                              placeholder={c.field === 'date_of_birth' ? 'YYYY-MM-DD' : ''}
                              inputMode={c.field === 'jersey_number' ? 'numeric' : undefined}
                              className={`w-full bg-dark rounded-lg px-2 py-1.5 text-white text-sm border focus:outline-none focus:border-green ${
                                unsure ? 'border-yellow-400/70' : changed ? 'border-blue-400/50' : 'border-white/10'
                              }`}
                            />
                          </td>
                        )
                      })}
                      <td className="py-2 pr-2 text-gray text-xs">{s === 'new' ? r.extra : ''}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>

          {error && <p className="text-red text-sm mt-4">{error}</p>}
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <button onClick={() => { setStep('upload'); setError(null) }} className="text-gray text-sm hover:text-white transition-colors">
              &larr; Use a different file
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving || toSave === 0}
              className="ml-auto bg-green text-dark font-bold px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Saving…' : toSave === 0 ? 'Nothing new to save' : `Save ${toSave} player${toSave === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'done' && saved && result) {
    return (
      <div className="w-full max-w-xl mx-auto">
        <div className="bg-dark-secondary rounded-2xl p-8 shadow-lg text-center">
          <h2 className="text-xl font-bold mb-2">Roster saved</h2>
          <p className="text-sm text-white mb-2">
            {saved.added} added · {saved.updated} updated
          </p>
          <p className="text-xs text-gray mb-6">
            Players claim their spot when they join with your team code.
          </p>
          {onDone ? (
            <button onClick={onDone} className="bg-green text-dark font-bold px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity">
              Continue to dashboard
            </button>
          ) : (
            <Link href={`/dashboard/teams/${result.teamId}`} className="text-green underline hover:opacity-90 transition-opacity">
              View roster &rarr;
            </Link>
          )}
        </div>
      </div>
    )
  }

  return null
}
