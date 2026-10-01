'use client'

import { useState } from 'react'
import { DRILL_CATEGORY_LABELS, type DrillCategory } from '@/lib/tactics/drill-categories'
import { MAX_PLAN_DRILLS } from '@/lib/game-plan'
import type { PlanDrill } from './plan-client'

function Thumb({ url, title }: { url: string | null; title: string }) {
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="" className="h-14 w-20 shrink-0 rounded-lg border border-black/10 object-cover" loading="lazy" />
  ) : (
    <span className="flex h-14 w-20 shrink-0 items-center justify-center rounded-lg border border-black/10 bg-green/10 text-[10px] font-semibold text-green" aria-hidden="true">
      {title.slice(0, 1).toUpperCase() || 'D'}
    </span>
  )
}

export default function TacticsTab({
  drills,
  attachedIds,
  onChange,
  onCreateNew,
  creating,
}: {
  drills: PlanDrill[]
  attachedIds: string[]
  onChange: (ids: string[]) => void
  onCreateNew: () => void
  creating: boolean
}) {
  const [query, setQuery] = useState('')
  const byId = new Map(drills.map(d => [d.id, d]))
  const q = query.trim().toLowerCase()
  const library = drills.filter(d => !q || d.title.toLowerCase().includes(q))

  function toggle(id: string) {
    if (attachedIds.includes(id)) onChange(attachedIds.filter(x => x !== id))
    else if (attachedIds.length < MAX_PLAN_DRILLS) onChange([...attachedIds, id])
  }

  function move(id: string, dir: -1 | 1) {
    const i = attachedIds.indexOf(id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= attachedIds.length) return
    const next = [...attachedIds]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChange(next)
  }

  return (
    <div className="space-y-5">
      <section className="rounded-2xl border border-black/10 bg-dark-secondary p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-gray">
            Attached ({attachedIds.length}) · prints in this order
          </p>
          <button
            type="button"
            onClick={onCreateNew}
            disabled={creating}
            className="rounded-xl bg-green px-4 py-2.5 text-sm font-bold text-dark hover:opacity-90 disabled:opacity-60"
          >
            {creating ? 'Opening editor…' : 'Create new drill'}
          </button>
        </div>
        {attachedIds.length === 0 ? (
          <p className="py-2 text-sm text-gray">Nothing attached yet. Pick boards from your library below.</p>
        ) : (
          <ul className="divide-y divide-black/5">
            {attachedIds.map((id, i) => {
              const d = byId.get(id)
              const title = d?.title ?? 'Drill'
              return (
                <li key={id} className="flex items-center gap-3 py-2">
                  <Thumb url={d?.thumbnailUrl ?? null} title={title} />
                  <span className="min-w-0 flex-1">
                    <a href={`/dashboard/tactics/${id}`} className="block truncate font-semibold text-white hover:text-green">{title}</a>
                    {d && <span className="block truncate text-xs text-gray">{DRILL_CATEGORY_LABELS[d.category as DrillCategory] ?? d.category}</span>}
                  </span>
                  <div className="flex shrink-0 items-center gap-1">
                    <button type="button" onClick={() => move(id, -1)} disabled={i === 0} aria-label={`Move ${title} up`} className="rounded-lg p-2 text-gray hover:bg-black/5 disabled:opacity-30">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="18 15 12 9 6 15" /></svg>
                    </button>
                    <button type="button" onClick={() => move(id, 1)} disabled={i === attachedIds.length - 1} aria-label={`Move ${title} down`} className="rounded-lg p-2 text-gray hover:bg-black/5 disabled:opacity-30">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="6 9 12 15 18 9" /></svg>
                    </button>
                    <button type="button" onClick={() => toggle(id)} aria-label={`Remove ${title}`} className="rounded-lg p-2 text-gray hover:bg-black/5 hover:text-red">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section className="rounded-2xl border border-black/10 bg-dark-secondary p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray">Tactics library</p>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search drills"
          aria-label="Search drills"
          className="mb-3 w-full rounded-xl border border-black/15 bg-dark px-4 py-2.5 text-base text-white placeholder:text-gray focus:border-green focus:outline-none"
        />
        {drills.length === 0 ? (
          <p className="py-2 text-sm text-gray">Your tactics library is empty. Create a drill to attach it.</p>
        ) : library.length === 0 ? (
          <p className="py-2 text-sm text-gray">No drill matches.</p>
        ) : (
          <ul className="grid gap-2 sm:grid-cols-2">
            {library.map(d => {
              const on = attachedIds.includes(d.id)
              return (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => toggle(d.id)}
                    aria-pressed={on}
                    className={`flex w-full items-center gap-3 rounded-xl border p-2 text-left transition-colors ${
                      on ? 'border-green bg-green/10' : 'border-black/10 hover:border-green/40'
                    }`}
                  >
                    <Thumb url={d.thumbnailUrl} title={d.title} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-white">{d.title}</span>
                      <span className="block truncate text-xs text-gray">{DRILL_CATEGORY_LABELS[d.category as DrillCategory] ?? d.category}</span>
                    </span>
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${on ? 'border-green bg-green text-dark' : 'border-black/25'}`}
                      aria-hidden="true"
                    >
                      {on && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                      )}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
