'use client'
import type { DrillSummary } from './actions'

export default function LibraryClient({ drills }: {
  drills: DrillSummary[]
  teams: { id: string; name: string }[]
  role: string
  currentProfileId: string
}) {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold">Tactics Board</h1>
      <p className="text-gray mt-2">{drills.length === 0 ? 'No drills yet.' : `${drills.length} drill(s).`}</p>
      <p className="text-gray text-sm mt-1">(Full UI coming — stubbed)</p>
    </div>
  )
}
