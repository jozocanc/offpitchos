'use client'

import { EVENT_TYPES, EVENT_TYPE_LABELS, type EventType } from '@/lib/constants'
import { teamLabel } from '@/lib/team-label'

interface Team {
  id: string
  name: string
  age_group: string
}

interface FiltersProps {
  teams: Team[]
  selectedTeam: string | null
  selectedType: EventType | null
  onTeamChange: (teamId: string | null) => void
  onTypeChange: (type: EventType | null) => void
}

export default function Filters({ teams, selectedTeam, selectedType, onTeamChange, onTypeChange }: FiltersProps) {
  return (
    <div className="flex flex-wrap gap-3">
      <select
        value={selectedTeam ?? ''}
        onChange={e => onTeamChange(e.target.value || null)}
        className="bg-dark border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-green transition-colors appearance-none"
      >
        <option value="">All Teams</option>
        {teams.map(t => (
          <option key={t.id} value={t.id}>{teamLabel(t.name, t.age_group)}</option>
        ))}
      </select>

      <select
        value={selectedType ?? ''}
        onChange={e => onTypeChange((e.target.value || null) as EventType | null)}
        className="bg-dark border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-green transition-colors appearance-none"
      >
        <option value="">All Types</option>
        {EVENT_TYPES.map(t => (
          <option key={t} value={t}>{EVENT_TYPE_LABELS[t]}</option>
        ))}
      </select>
    </div>
  )
}
