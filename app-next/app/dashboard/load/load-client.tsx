'use client'

import { useMemo, useState, useTransition } from 'react'
import Papa from 'papaparse'
import { useToast } from '@/components/toast'
import {
  GPS_FIELDS,
  ID_FIELDS,
  FIELD_LABELS,
  suggestMapping,
  coerce,
  type GpsField,
  type MappedField,
} from '@/lib/gps/columns'
import { matchRow, type RosterPlayer } from '@/lib/gps/match'
import { importEventLoad, type ImportRow, type LoadPageData } from './actions'

type Step = 'pick' | 'map' | 'review'

interface PreparedRow {
  rowNumber: number
  label: string
  playerId: string | null
  ambiguous: boolean
  metrics: Partial<Record<GpsField, number | null>>
  extra: Record<string, string>
}

const selectClass =
  'px-3 py-2 bg-dark border border-gray/20 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-green'

export default function LoadClient({ data }: { data: LoadPageData }) {
  const { toast } = useToast()
  const [pending, startTransition] = useTransition()

  const [step, setStep] = useState<Step>('pick')
  const [eventId, setEventId] = useState('')
  const [headers, setHeaders] = useState<string[]>([])
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([])
  const [mapping, setMapping] = useState<Record<string, MappedField | ''>>({})
  const [error, setError] = useState('')
  // Manual resolutions, keyed by CSV row number, kept beside the derived rows
  // rather than mutating them.
  const [overrides, setOverrides] = useState<Record<number, string>>({})

  const roster: RosterPlayer[] = data.roster

  function handleFile(file: File) {
    setError('')
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: results => {
        const csvHeaders = results.meta.fields ?? []
        if (csvHeaders.length === 0 || results.data.length === 0) {
          setError('That file has no readable rows.')
          return
        }
        setHeaders(csvHeaders)
        setRawRows(results.data)

        // Reuse the club's saved mapping when the export looks the same,
        // so a coach maps their vendor's headers once and never again.
        const saved = data.savedMapping
        const savedCovers = saved && csvHeaders.every(h => h in saved)
        setMapping(savedCovers ? saved : suggestMapping(csvHeaders))
        setStep('map')
      },
      error: err => setError(`Could not read that file: ${err.message}`),
    })
  }

  // Applying the mapping is pure, so the review list recomputes the moment a
  // dropdown changes rather than needing a "re-run" button.
  const prepared: PreparedRow[] = useMemo(() => {
    if (step === 'pick') return []

    const headerFor = (field: MappedField) =>
      headers.find(h => mapping[h] === field)

    const nameH = headerFor('player_name')
    const firstH = headerFor('player_first_name')
    const lastH = headerFor('player_last_name')
    const jerseyH = headerFor('jersey_number')

    return rawRows.map((raw, i) => {
      const match = matchRow(
        {
          name: nameH ? raw[nameH] : undefined,
          firstName: firstH ? raw[firstH] : undefined,
          lastName: lastH ? raw[lastH] : undefined,
          jersey: jerseyH ? raw[jerseyH] : undefined,
        },
        roster
      )

      const metrics: Partial<Record<GpsField, number | null>> = {}
      const extra: Record<string, string> = {}

      for (const h of headers) {
        const field = mapping[h]
        if (!field) {
          // Unmapped columns are kept rather than dropped — a metric we have no
          // column for is still the club's data.
          if (raw[h]) extra[h] = raw[h]
          continue
        }
        if ((GPS_FIELDS as readonly string[]).includes(field)) {
          metrics[field as GpsField] = coerce(field as GpsField, raw[h], h)
        }
      }

      const label =
        (nameH && raw[nameH]) ||
        [firstH && raw[firstH], lastH && raw[lastH]].filter(Boolean).join(' ') ||
        (jerseyH && raw[jerseyH] ? `#${raw[jerseyH]}` : `Row ${i + 2}`)

      return {
        rowNumber: i + 2,
        label: String(label),
        playerId: match.playerId,
        ambiguous: match.ambiguous,
        metrics,
        extra,
      }
    })
  }, [step, headers, rawRows, mapping, roster])

  const unmatched = prepared.filter(r => !r.playerId)

  function setRowPlayer(rowNumber: number, playerId: string) {
    setOverrides(prev => ({ ...prev, [rowNumber]: playerId }))
  }

  const finalRows: ImportRow[] = prepared
    .map(r => {
      const playerId = overrides[r.rowNumber] ?? r.playerId
      return playerId ? { playerId, metrics: r.metrics, extra: r.extra } : null
    })
    .filter((r): r is ImportRow => r !== null)

  function handleImport() {
    setError('')
    startTransition(async () => {
      const res = await importEventLoad(eventId, finalRows, mapping)
      if (!res.ok) {
        setError(res.error)
        return
      }
      toast(`Imported load for ${res.data.imported} players`, 'success')
      setStep('pick')
      setHeaders([])
      setRawRows([])
      setOverrides({})
    })
  }

  const session = data.sessions.find(s => s.eventId === eventId)

  return (
    <div className="space-y-6">
      {/* Step 1 — which session, which file */}
      {step === 'pick' && (
        <div className="bg-dark-secondary rounded-2xl p-6 border border-white/10 space-y-4">
          <div>
            <label htmlFor="session" className="block text-sm text-gray mb-1">Session</label>
            <select
              id="session"
              value={eventId}
              onChange={e => setEventId(e.target.value)}
              className={`${selectClass} w-full`}
            >
              <option value="">Select a session…</option>
              {data.sessions.map(s => (
                <option key={s.eventId} value={s.eventId}>
                  {new Date(s.startTime).toLocaleDateString()} · {s.title}
                  {s.playersImported > 0 ? ` (${s.playersImported} already imported)` : ''}
                </option>
              ))}
            </select>
            {data.sessions.length === 0 && (
              <p className="text-gray text-xs mt-2">
                No past sessions yet. Load attaches to a session that has already happened.
              </p>
            )}
          </div>

          <div>
            <label htmlFor="file" className="block text-sm text-gray mb-1">Vest export (CSV)</label>
            <input
              id="file"
              type="file"
              accept=".csv,text/csv"
              disabled={!eventId}
              onChange={e => {
                const f = e.target.files?.[0]
                if (f) handleFile(f)
              }}
              className="block w-full text-sm text-gray file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-green file:text-dark hover:file:opacity-90 disabled:opacity-40"
            />
            <p className="text-gray text-xs mt-2">
              Any vendor. Titan, Catapult, STATSports, Polar and WIMU all export CSV; the columns get mapped in the next step.
            </p>
          </div>
        </div>
      )}

      {/* Step 2 — map the vendor's headers onto our fields */}
      {step === 'map' && (
        <div className="bg-dark-secondary rounded-2xl p-6 border border-white/10">
          <h2 className="font-bold text-white mb-1">Match the columns</h2>
          <p className="text-gray text-sm mb-4">
            We guessed from the headers. Anything left as “Skip” is still stored, just not charted.
          </p>

          <div className="space-y-2 max-h-[22rem] overflow-y-auto pr-1">
            {headers.map(h => (
              <div key={h} className="flex items-center gap-3">
                <span className="text-sm text-white font-mono flex-1 truncate" title={h}>{h}</span>
                <select
                  value={mapping[h] ?? ''}
                  onChange={e => setMapping({ ...mapping, [h]: e.target.value as MappedField | '' })}
                  className={selectClass}
                >
                  <option value="">Skip</option>
                  <optgroup label="Who">
                    {ID_FIELDS.map(f => <option key={f} value={f}>{FIELD_LABELS[f]}</option>)}
                  </optgroup>
                  <optgroup label="Metrics">
                    {GPS_FIELDS.map(f => <option key={f} value={f}>{FIELD_LABELS[f]}</option>)}
                  </optgroup>
                </select>
              </div>
            ))}
          </div>

          <div className="flex gap-2 mt-5">
            <button
              onClick={() => setStep('review')}
              className="bg-green text-dark font-bold px-4 py-2 rounded-xl text-sm hover:opacity-90"
            >
              Continue
            </button>
            <button
              onClick={() => { setStep('pick'); setHeaders([]); setRawRows([]) }}
              className="bg-white/5 text-white border border-white/10 font-semibold px-4 py-2 rounded-xl text-sm hover:bg-white/10"
            >
              Back
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — who did we fail to match */}
      {step === 'review' && (
        <div className="bg-dark-secondary rounded-2xl p-6 border border-white/10">
          <h2 className="font-bold text-white mb-1">
            {finalRows.length} of {prepared.length} rows matched a player
          </h2>
          <p className="text-gray text-sm mb-4">
            {session ? `Importing into ${session.title}.` : ''} Unmatched rows are skipped unless you pick someone.
          </p>

          {unmatched.length > 0 && (
            <div className="space-y-2 max-h-72 overflow-y-auto pr-1 mb-5">
              {unmatched.map(r => (
                <div key={r.rowNumber} className="flex items-center gap-3">
                  <span className="text-sm text-white flex-1 truncate">
                    {r.label}
                    {r.ambiguous && <span className="text-yellow text-xs ml-2">more than one match</span>}
                  </span>
                  <select
                    value={overrides[r.rowNumber] ?? ''}
                    onChange={e => setRowPlayer(r.rowNumber, e.target.value)}
                    className={selectClass}
                  >
                    <option value="">Skip this row</option>
                    {roster.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.jerseyNumber !== null ? `#${p.jerseyNumber} ` : ''}{p.firstName} {p.lastName}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}

          {error && <p className="text-red text-sm mb-3">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={handleImport}
              disabled={pending || finalRows.length === 0}
              className="bg-green text-dark font-bold px-4 py-2 rounded-xl text-sm hover:opacity-90 disabled:opacity-40"
            >
              {pending ? 'Importing…' : `Import ${finalRows.length} players`}
            </button>
            <button
              onClick={() => setStep('map')}
              className="bg-white/5 text-white border border-white/10 font-semibold px-4 py-2 rounded-xl text-sm hover:bg-white/10"
            >
              Back
            </button>
          </div>
        </div>
      )}

      {error && step === 'pick' && <p className="text-red text-sm">{error}</p>}
    </div>
  )
}
