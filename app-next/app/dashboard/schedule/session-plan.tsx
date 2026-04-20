'use client'
import { useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  listAttachedDrills,
  listDrillsForPicker,
  attachDrill,
  detachDrill,
  reorderDrills,
  updateAttachment,
  type AttachedDrill,
} from './actions'

interface PickerDrill {
  id: string
  title: string
  category: string
  teamId: string | null
  thumbnailUrl: string | null
}

interface Props {
  eventId: string
  eventDurationMin?: number  // for total-vs-scheduled warning
}

export default function SessionPlan({ eventId, eventDurationMin }: Props) {
  const [drills, setDrills] = useState<AttachedDrill[] | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerDrills, setPickerDrills] = useState<PickerDrill[] | null>(null)
  const [pickerSearch, setPickerSearch] = useState('')
  const [, startTransition] = useTransition()

  useEffect(() => {
    listAttachedDrills(eventId).then(setDrills)
  }, [eventId])

  async function openPicker() {
    setPickerOpen(true)
    if (!pickerDrills) setPickerDrills(await listDrillsForPicker(eventId))
  }

  function refresh() {
    listAttachedDrills(eventId).then(setDrills)
  }

  async function onAttach(drillId: string) {
    await attachDrill(eventId, drillId)
    setPickerOpen(false)
    refresh()
  }

  async function onDetach(attachmentId: string) {
    if (!confirm('Remove this drill from the session plan?')) return
    await detachDrill(attachmentId)
    refresh()
  }

  async function onUpdate(attachmentId: string, patch: { duration_minutes?: number; coach_notes?: string | null }) {
    startTransition(async () => {
      await updateAttachment(attachmentId, patch)
      refresh()
    })
  }

  async function moveItem(fromIdx: number, toIdx: number) {
    if (!drills) return
    if (toIdx < 0 || toIdx >= drills.length) return
    const next = [...drills]
    const [item] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, item)
    setDrills(next.map((d, i) => ({ ...d, orderIndex: i })))
    await reorderDrills(eventId, next.map(d => d.id))
  }

  if (drills === null) {
    return <div className="text-gray text-xs">Loading session plan…</div>
  }

  const totalMin = drills.reduce((sum, d) => sum + d.durationMinutes, 0)
  const overscheduled = eventDurationMin !== undefined && totalMin > eventDurationMin

  const filteredPicker = (pickerDrills ?? []).filter(d =>
    !pickerSearch || d.title.toLowerCase().includes(pickerSearch.toLowerCase())
  )

  return (
    <section className="mt-4 border-t border-white/5 pt-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Session plan</h3>
        <button
          type="button"
          onClick={openPicker}
          className="text-sm bg-green text-dark px-3 py-1.5 rounded hover:brightness-110"
        >
          + Add drill
        </button>
      </div>

      {drills.length > 0 && (
        <div className={`text-xs ${overscheduled ? 'text-red' : 'text-gray'}`}>
          Total: {totalMin} min
          {eventDurationMin !== undefined && ` / ${eventDurationMin} min scheduled`}
          {overscheduled && ' — over'}
        </div>
      )}

      {drills.length === 0 ? (
        <p className="text-sm text-gray">No drills attached yet.</p>
      ) : (
        <ul className="space-y-2">
          {drills.map((d, idx) => (
            <li key={d.id} className="bg-dark rounded border border-white/5 p-3 flex items-start gap-3">
              <div className="flex flex-col gap-1 pt-1">
                <button type="button" onClick={() => moveItem(idx, idx - 1)} disabled={idx === 0}
                        className="text-xs text-gray disabled:opacity-30 hover:text-white">▲</button>
                <button type="button" onClick={() => moveItem(idx, idx + 1)} disabled={idx === drills.length - 1}
                        className="text-xs text-gray disabled:opacity-30 hover:text-white">▼</button>
              </div>
              <div className="w-20 h-12 bg-dark-secondary rounded overflow-hidden flex-shrink-0">
                {/* eslint-disable @next/next/no-img-element */}
                {d.thumbnailUrl
                  ? <img src={d.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                  : <div className="w-full h-full flex items-center justify-center text-[10px] text-gray">No preview</div>}
                {/* eslint-enable @next/next/no-img-element */}
              </div>
              <div className="flex-1 min-w-0 space-y-1">
                <Link href={`/dashboard/tactics/${d.drillId}?readonly=1`} target="_blank" className="block text-sm font-medium hover:text-green truncate">
                  {d.title}
                </Link>
                <div className="text-xs text-gray">{d.category}</div>
                <div className="flex gap-2 items-center">
                  <label className="text-xs text-gray">Duration
                    <input
                      type="number"
                      defaultValue={d.durationMinutes}
                      min={1}
                      onBlur={e => {
                        const v = parseInt(e.target.value, 10)
                        if (Number.isFinite(v) && v > 0 && v !== d.durationMinutes) onUpdate(d.id, { duration_minutes: v })
                      }}
                      className="ml-1 w-14 bg-dark-secondary border border-white/10 rounded px-1 py-0.5 text-xs"
                    />
                    <span className="ml-1">min</span>
                  </label>
                </div>
                <textarea
                  placeholder="Coach notes…"
                  defaultValue={d.coachNotes ?? ''}
                  rows={1}
                  onBlur={e => {
                    const v = e.target.value.trim() || null
                    if (v !== d.coachNotes) onUpdate(d.id, { coach_notes: v })
                  }}
                  className="w-full bg-dark-secondary border border-white/10 rounded px-2 py-1 text-xs"
                />
              </div>
              <button type="button" onClick={() => onDetach(d.id)} className="text-xs text-gray hover:text-red self-start">✕</button>
            </li>
          ))}
        </ul>
      )}

      {pickerOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4" onClick={() => setPickerOpen(false)}>
          <div className="bg-dark-secondary rounded-lg max-w-lg w-full max-h-[80vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b border-white/5 flex items-center justify-between gap-2">
              <h3 className="font-semibold">Attach drill</h3>
              <button onClick={() => setPickerOpen(false)} className="text-gray hover:text-white">✕</button>
            </div>
            <div className="p-3 border-b border-white/5">
              <input value={pickerSearch} onChange={e => setPickerSearch(e.target.value)} placeholder="Search…"
                     className="w-full bg-dark border border-white/10 rounded px-2 py-1.5 text-sm" />
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-1">
              {!pickerDrills ? (
                <p className="text-sm text-gray p-3">Loading…</p>
              ) : filteredPicker.length === 0 ? (
                <p className="text-sm text-gray p-3">No drills match.</p>
              ) : filteredPicker.map(d => (
                <button key={d.id} onClick={() => onAttach(d.id)}
                        className="w-full text-left flex items-center gap-3 p-2 hover:bg-white/5 rounded">
                  <div className="w-16 h-10 bg-dark rounded overflow-hidden flex-shrink-0">
                    {/* eslint-disable @next/next/no-img-element */}
                    {d.thumbnailUrl
                      ? <img src={d.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full flex items-center justify-center text-[10px] text-gray">No preview</div>}
                    {/* eslint-enable @next/next/no-img-element */}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{d.title}</div>
                    <div className="text-xs text-gray">{d.category}{d.teamId === null ? ' · Club-wide' : ''}</div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
