'use client'

import { useState, useTransition } from 'react'
import { updateTeam, deleteTeam } from './actions'

const AGE_GROUPS = ['U6', 'U7', 'U8', 'U9', 'U10', 'U11', 'U12', 'U13', 'U14', 'U15', 'U16', 'U17', 'U18', 'U19', 'Adult']

interface TeamActionsProps {
  teamId: string
  name: string
  ageGroup: string
}

export default function TeamActions({ teamId, name, ageGroup }: TeamActionsProps) {
  const [editing, setEditing] = useState(false)
  const [draftName, setDraftName] = useState(name)
  const [draftAge, setDraftAge] = useState(ageGroup)
  const [isPending, startTransition] = useTransition()

  function handleSave() {
    startTransition(async () => {
      await updateTeam(teamId, draftName, draftAge)
      setEditing(false)
    })
  }

  function handleDelete() {
    if (!confirm(`Delete "${name}"? This will remove all members and revoke all pending invites. This cannot be undone.`)) return
    startTransition(() => deleteTeam(teamId))
  }

  if (editing) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <input
          type="text"
          value={draftName}
          onChange={(e) => setDraftName(e.target.value)}
          className="bg-dark rounded-lg px-3 py-1.5 border border-green/40 text-white text-sm focus:outline-none focus:ring-2 focus:ring-green"
          autoFocus
        />
        <select
          value={draftAge}
          onChange={(e) => setDraftAge(e.target.value)}
          className="bg-dark rounded-lg px-3 py-1.5 border border-green/40 text-white text-sm focus:outline-none focus:ring-2 focus:ring-green"
        >
          {AGE_GROUPS.map(ag => (
            <option key={ag} value={ag}>{ag}</option>
          ))}
        </select>
        <button
          onClick={handleSave}
          disabled={isPending}
          className="text-xs font-bold bg-green text-dark px-3 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50"
        >
          {isPending ? 'Saving...' : 'Save'}
        </button>
        <button
          onClick={() => { setEditing(false); setDraftName(name); setDraftAge(ageGroup) }}
          className="text-xs font-medium text-gray hover:text-white px-2 py-1.5"
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setEditing(true)}
        className="text-xs font-bold text-green hover:opacity-80 transition-opacity"
      >
        Edit
      </button>
      <button
        onClick={handleDelete}
        disabled={isPending}
        className="text-xs font-medium text-red hover:opacity-80 transition-opacity disabled:opacity-50"
      >
        {isPending ? 'Deleting...' : 'Delete'}
      </button>
    </div>
  )
}
