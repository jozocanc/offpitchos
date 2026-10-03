'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { readScheduleFile, saveScheduleRows } from './actions'
import { SCHEDULE_TYPES, type ScheduleDraftRow, type ScheduleField, type ScheduleReadResult, type ScheduleSaveResult } from './types'
import { IMPORT_ACCEPT, IMPORT_TYPES_LABEL, MAX_IMPORT_BYTES, shrinkImage } from '@/lib/import-files'
import { formatDayKeyShort } from '@/lib/format-datetime'

type Step = 'upload' | 'reading' | 'review' | 'done'

const TYPE_LABEL: Record<string, string> = { game: 'Game', tournament: 'Tournament', practice: 'Practice', meeting: 'Meeting' }

function status(r: ScheduleDraftRow): 'new' | 'update' | 'same' {
  if (!r.matchId) return 'new'
  return r.changes.length > 0 ? 'update' : 'same'
}

export default function ScheduleImport({ teams }: { teams: { id: string; name: string }[] }) {
  const [step, setStep] = useState<Step>('upload')
  const [teamId, setTeamId] = useState(teams.length === 1 ? teams[0].id : '')
  const [result, setResult] = useState<ScheduleReadResult | null>(null)
  const [rows, setRows] = useState<ScheduleDraftRow[]>([])
  const [saved, setSaved] = useState<ScheduleSaveResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isSaving, startSaving] = useTransition()
  const needsTeam = teams.length > 1

  async function handleFile(original: File) {
    setError(null)
    if (needsTeam && !teamId) {
      setError('Choose which team this schedule is for first.')
      return
    }
    const file = await shrinkImage(original)
    if (file.size > MAX_IMPORT_BYTES) {
      setError('That file is over 4 MB. Upload a smaller copy, a screenshot, or just the schedule page.')
      return
    }
    setStep('reading')
    const fd = new FormData()
    fd.set('file', file)
    if (teamId) fd.set('teamId', teamId)
    const res = await readScheduleFile(fd)
    if (!res.ok) {
      setError(res.error)
      setStep('upload')
      return
    }
    setResult(res.data)
    setRows(res.data.rows)
    setStep('review')
  }

  function update(key: string, patch: Partial<ScheduleDraftRow>) {
    setRows(rs => rs.map(r => (r.key === key ? { ...r, ...patch } : r)))
  }

  function handleSave() {
    if (!result) return
    setError(null)
    startSaving(async () => {
      const res = await saveScheduleRows(result.teamId, rows)
      if (!res.ok) {
        setError(res.error)
        return
      }
      setSaved(res.data)
      setStep('done')
    })
  }

  const inputCls = (r: ScheduleDraftRow, f: ScheduleField) =>
    `w-full bg-dark rounded-lg px-2 py-1.5 text-white text-sm border focus:outline-none focus:border-green ${
      r.uncertain.includes(f) ? 'border-yellow-400/70' : r.changes.includes(f) ? 'border-blue-400/50' : 'border-white/10'
    }`

  if (step === 'upload' || step === 'reading') {
    const reading = step === 'reading'
    return (
      <div className="w-full max-w-xl mx-auto">
        <div className="bg-dark-secondary rounded-2xl p-6 md:p-8 shadow-lg">
          <h2 className="text-xl font-bold mb-1">Import schedule</h2>
          <p className="text-gray text-sm mb-6">
            Upload your schedule in any format: {IMPORT_TYPES_LABEL}. A screenshot of the athletics website works
            too. You check every event before anything is saved, and nobody is notified.
          </p>
          {needsTeam && (
            <select
              value={teamId}
              onChange={e => setTeamId(e.target.value)}
              disabled={reading}
              className="w-full mb-4 bg-dark border border-white/10 rounded-xl px-3 py-2.5 text-white text-sm focus:outline-none focus:border-green"
            >
              <option value="">Which team is this schedule for?</option>
              {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
            </select>
          )}
          {reading ? (
            <div className="bg-dark border border-white/10 rounded-xl p-5 text-sm">
              <p className="text-white font-semibold">Reading your schedule…</p>
              <p className="text-gray mt-1">This usually takes 20 to 60 seconds. Keep this page open.</p>
            </div>
          ) : (
            <label className="block cursor-pointer bg-dark border-2 border-dashed border-white/15 hover:border-green rounded-xl p-6 text-center transition-colors">
              <span className="text-green font-bold">Choose a file</span>
              <span className="block text-gray text-xs mt-1">or take a photo of the printed schedule</span>
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
          <h2 className="text-xl font-bold mb-1">Check the schedule for {result.teamName}</h2>
          <p className="text-gray text-sm mb-4">
            {rows.length} events read from the file. Fix anything that looks wrong, untick anything you don&apos;t want,
            then save. Times are {result.timeZone.replace('_', ' ')} time; leave the time blank for TBD.
          </p>

          <div className="flex flex-wrap gap-2 mb-4 text-xs">
            <span className="bg-green/10 text-green border border-green/20 px-2 py-1 rounded-full font-bold">{counts.new} new</span>
            {counts.update > 0 && (
              <span className="bg-blue-400/10 text-blue-300 border border-blue-400/20 px-2 py-1 rounded-full font-bold">{counts.update} to update</span>
            )}
            {counts.same > 0 && (
              <span className="bg-white/5 text-gray border border-white/10 px-2 py-1 rounded-full font-bold">{counts.same} already on the schedule</span>
            )}
            {flagged > 0 && (
              <span className="bg-yellow-400/10 text-yellow-400 border border-yellow-400/20 px-2 py-1 rounded-full font-bold">
                {flagged} to double-check (yellow)
              </span>
            )}
          </div>

          <div className="overflow-x-auto -mx-4 md:mx-0 px-4 md:px-0">
            <table className="min-w-[900px] w-full text-sm">
              <thead>
                <tr className="text-left text-gray text-xs uppercase tracking-wider">
                  <th className="py-2 pr-2 w-8" />
                  <th className="py-2 pr-2 w-24">Status</th>
                  <th className="py-2 pr-2 w-36">Date</th>
                  <th className="py-2 pr-2 w-28">Time</th>
                  <th className="py-2 pr-2 w-32">Type</th>
                  <th className="py-2 pr-2 w-28">Home/away</th>
                  <th className="py-2 pr-2">Opponent / name</th>
                  <th className="py-2 pr-2 w-48">Location</th>
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
                          aria-label={`Include ${r.opponent} on ${r.date}`}
                          className="w-4 h-4 accent-green"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        {s === 'new' && <span className="text-green text-xs font-bold">New</span>}
                        {s === 'update' && <span className="text-blue-300 text-xs font-bold" title={`Updates ${r.matchLabel}`}>Update</span>}
                        {s === 'same' && <span className="text-gray text-xs font-bold" title={r.matchLabel ?? ''}>On schedule</span>}
                      </td>
                      <td className="py-1.5 pr-2">
                        <input type="date" value={r.date} onChange={e => update(r.key, { date: e.target.value })} className={inputCls(r, 'date')} />
                        {r.date && <span className="block text-[11px] text-gray mt-0.5">{formatDayKeyShort(r.date)}</span>}
                      </td>
                      <td className="py-1.5 pr-2">
                        <input type="time" value={r.time} onChange={e => update(r.key, { time: e.target.value })} className={inputCls(r, 'time')} />
                        {!r.time && <span className="block text-[11px] text-gray mt-0.5">TBD</span>}
                      </td>
                      <td className="py-1.5 pr-2">
                        <select value={r.type} onChange={e => update(r.key, { type: e.target.value as ScheduleDraftRow['type'] })} className={inputCls(r, 'type')}>
                          {SCHEDULE_TYPES.map(t => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                        </select>
                      </td>
                      <td className="py-1.5 pr-2">
                        <select value={r.home_away} onChange={e => update(r.key, { home_away: e.target.value as ScheduleDraftRow['home_away'] })} className={inputCls(r, 'home_away')}>
                          <option value="">Not set</option>
                          <option value="home">Home</option>
                          <option value="away">Away</option>
                          <option value="neutral">Neutral</option>
                        </select>
                      </td>
                      <td className="py-1.5 pr-2">
                        <input value={r.opponent} onChange={e => update(r.key, { opponent: e.target.value })} className={inputCls(r, 'opponent')} />
                      </td>
                      <td className="py-1.5 pr-2">
                        <input value={r.location} onChange={e => update(r.key, { location: e.target.value })} className={inputCls(r, 'location')} />
                      </td>
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
              {isSaving ? 'Saving…' : toSave === 0 ? 'Nothing new to save' : `Save ${toSave} event${toSave === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (step === 'done' && saved) {
    return (
      <div className="w-full max-w-xl mx-auto">
        <div className="bg-dark-secondary rounded-2xl p-8 shadow-lg text-center">
          <h2 className="text-xl font-bold mb-2">Schedule saved</h2>
          <p className="text-sm text-white mb-6">{saved.added} added · {saved.updated} updated</p>
          <Link href="/dashboard/schedule" className="text-green underline hover:opacity-90 transition-opacity">
            View schedule &rarr;
          </Link>
        </div>
      </div>
    )
  }

  return null
}
