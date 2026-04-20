'use client'
import type { DrillRow } from '@/lib/tactics/object-schema'

export default function EditorClient({ drill }: {
  drill: DrillRow
  teams: { id: string; name: string }[]
  role: string
}) {
  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">{drill.title}</h1>
      <p className="text-gray text-sm">Editor coming — stubbed for Task 8.</p>
      <p className="text-gray text-xs">Drill id: {drill.id}</p>
    </div>
  )
}
