'use client'
import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { DRILL_CATEGORIES, DRILL_CATEGORY_LABELS, VISIBILITIES } from '@/lib/tactics/drill-categories'
import { createBlankDrillFormAction, deleteDrill, duplicateDrill, updateVisibility } from './actions'
import type { DrillSummary } from './actions'
import GenerateModal from './generate-modal'

interface Props {
  drills: DrillSummary[]
  teams: { id: string; name: string }[]
  role: string
  currentProfileId: string
}

export default function LibraryClient({ drills, teams, role, currentProfileId }: Props) {
  const router = useRouter()
  const [, startTransition] = useTransition()
  const [teamId, setTeamId] = useState<string>('all')
  const [category, setCategory] = useState<string>('all')
  const [visibility, setVisibility] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [generateOpen, setGenerateOpen] = useState(false)

  // defaultTeamId for the modal — use the active filter if it's a real team
  const defaultTeamId = teamId !== 'all' && teamId !== 'none' ? teamId : (teams[0]?.id ?? undefined)

  const filtered = useMemo(() => drills.filter(d => {
    if (teamId !== 'all' && (teamId === 'none' ? d.teamId !== null : d.teamId !== teamId)) return false
    if (category !== 'all' && d.category !== category) return false
    if (visibility === 'mine') { if (d.createdById !== currentProfileId) return false }
    else if (visibility !== 'all' && d.visibility !== visibility) return false
    if (search && !d.title.toLowerCase().includes(search.toLowerCase())) return false
    return true
  }), [drills, teamId, category, visibility, search, currentProfileId])

  function handleDelete(id: string) {
    if (!confirm('Delete this drill? This cannot be undone.')) return
    startTransition(async () => { await deleteDrill(id); router.refresh() })
  }

  function handleDuplicate(id: string) {
    startTransition(async () => {
      const newId = await duplicateDrill(id)
      router.push(`/dashboard/tactics/${newId}`)
    })
  }

  function handleVisibilityChange(id: string, v: 'private'|'team'|'club') {
    startTransition(async () => { await updateVisibility(id, v); router.refresh() })
  }

  return (
    <div className="p-4 md:p-6 space-y-4">
      <header className="flex items-center justify-between flex-wrap gap-3">
        <h1 className="text-2xl font-bold">Tactics Board</h1>
        <div className="flex items-center gap-2">
          {(role === 'doc' || role === 'coach') && (
            <button
              type="button"
              onClick={() => setGenerateOpen(true)}
              className="border border-white/20 text-white px-4 py-2 rounded-lg font-medium hover:bg-white/5 transition"
            >
              Ask Pep
            </button>
          )}
          <form action={createBlankDrillFormAction}>
            {teamId !== 'all' && teamId !== 'none' && (
              <input type="hidden" name="teamId" value={teamId} />
            )}
            <button
              type="submit"
              className="bg-green text-dark px-4 py-2 rounded-lg font-medium hover:brightness-110"
            >+ New drill</button>
          </form>
        </div>
      </header>

      {(role === 'doc' || role === 'coach') && (
        <GenerateModal
          open={generateOpen}
          onClose={() => setGenerateOpen(false)}
          teams={teams}
          role={role as 'doc' | 'coach'}
          defaultTeamId={defaultTeamId}
        />
      )}

      <div className="flex flex-wrap gap-2">
        <select value={teamId} onChange={e => setTeamId(e.target.value)} className="bg-dark-secondary border border-white/10 rounded px-3 py-2 text-sm">
          <option value="all">All teams</option>
          <option value="none">Club-wide</option>
          {teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <select value={category} onChange={e => setCategory(e.target.value)} className="bg-dark-secondary border border-white/10 rounded px-3 py-2 text-sm">
          <option value="all">All categories</option>
          {DRILL_CATEGORIES.map(c => <option key={c} value={c}>{DRILL_CATEGORY_LABELS[c]}</option>)}
        </select>
        <select value={visibility} onChange={e => setVisibility(e.target.value)} className="bg-dark-secondary border border-white/10 rounded px-3 py-2 text-sm">
          <option value="all">All visibility</option>
          <option value="mine">My drills</option>
          {VISIBILITIES.map(v => <option key={v} value={v}>{v[0].toUpperCase() + v.slice(1)}</option>)}
        </select>
        <input
          value={search} onChange={e => setSearch(e.target.value)} placeholder="Search drills…"
          className="bg-dark-secondary border border-white/10 rounded px-3 py-2 text-sm flex-1 min-w-[160px]"
        />
      </div>

      {filtered.length === 0 ? (
        <div className="border border-dashed border-white/10 rounded-lg p-12 text-center text-gray">
          <p className="mb-2">No drills yet.</p>
          <p className="text-sm">Create your first drill to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {filtered.map(d => (
            <DrillCard
              key={d.id}
              drill={d}
              onDelete={handleDelete}
              onDuplicate={handleDuplicate}
              onVisibilityChange={handleVisibilityChange}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function DrillCard({ drill, onDelete, onDuplicate, onVisibilityChange }: {
  drill: DrillSummary
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
  onVisibilityChange: (id: string, v: 'private'|'team'|'club') => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  const vIcon = drill.visibility === 'private' ? '🔒' : drill.visibility === 'team' ? '👥' : '🌍'

  return (
    <div className="bg-dark-secondary rounded-lg border border-white/5 hover:border-white/20 transition">
      <Link href={`/dashboard/tactics/${drill.id}`} className="block">
        <div className="aspect-[16/10] bg-dark rounded-t-lg overflow-hidden flex items-center justify-center text-gray text-xs">
          {drill.thumbnailUrl
            ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={drill.thumbnailUrl} alt="" className="w-full h-full object-cover" />
            )
            : <span>No preview yet</span>}
        </div>
      </Link>
      <div className="p-3 space-y-2">
        <Link href={`/dashboard/tactics/${drill.id}`} className="block font-medium truncate hover:text-green">{drill.title}</Link>
        <div className="flex items-center gap-2 text-xs text-gray">
          <span>{vIcon} {drill.visibility}</span>
          {drill.teamName && <span>· {drill.teamName}</span>}
          <span>· {drill.category}</span>
        </div>
        <div className="flex items-center justify-between text-xs text-gray">
          <span className="truncate">{drill.createdByName ?? 'Unknown'}</span>
          <div className="relative">
            <button onClick={() => setMenuOpen(o => !o)} aria-label="More options" className="px-2 py-1 hover:bg-white/5 rounded">⋯</button>
            {menuOpen && (
              <>
                <div className="fixed inset-0 z-0" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 bg-dark border border-white/10 rounded-lg shadow-lg z-20 min-w-[160px]">
                  <button onClick={() => { setMenuOpen(false); onDuplicate(drill.id) }} className="block w-full text-left px-3 py-2 text-sm hover:bg-white/5">Duplicate</button>
                  {drill.canEdit && <>
                    <button onClick={() => { setMenuOpen(false); onVisibilityChange(drill.id, 'private') }} className="block w-full text-left px-3 py-2 text-sm hover:bg-white/5">Make Private</button>
                    <button onClick={() => { setMenuOpen(false); onVisibilityChange(drill.id, 'team') }} className="block w-full text-left px-3 py-2 text-sm hover:bg-white/5">Make Team</button>
                    <button onClick={() => { setMenuOpen(false); onVisibilityChange(drill.id, 'club') }} className="block w-full text-left px-3 py-2 text-sm hover:bg-white/5">Make Club-wide</button>
                  </>}
                  {drill.canDelete && <button onClick={() => { setMenuOpen(false); onDelete(drill.id) }} className="block w-full text-left px-3 py-2 text-sm hover:bg-white/5 text-red">Delete</button>}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
