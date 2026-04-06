'use client'

import { useState, useTransition } from 'react'

interface EditableFieldProps {
  label: string
  value: string
  onSave: (value: string) => Promise<{ error?: string; success?: boolean }>
}

export default function EditableField({ label, value, onSave }: EditableFieldProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [error, setError] = useState('')
  const [isPending, startTransition] = useTransition()

  function handleEdit() {
    setDraft(value)
    setError('')
    setEditing(true)
  }

  function handleCancel() {
    setEditing(false)
    setError('')
  }

  function handleSave() {
    startTransition(async () => {
      const result = await onSave(draft)
      if (result.error) {
        setError(result.error)
      } else {
        setEditing(false)
      }
    })
  }

  if (!editing) {
    return (
      <div>
        <label className="block text-sm font-medium text-gray mb-1">{label}</label>
        <div className="bg-dark rounded-xl px-4 py-3 border border-white/5 flex items-center justify-between">
          <p className="text-white">{value || '—'}</p>
          <button
            onClick={handleEdit}
            className="text-xs font-bold text-green hover:opacity-80 transition-opacity"
          >
            Edit
          </button>
        </div>
      </div>
    )
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray mb-1">{label}</label>
      <div className="space-y-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full bg-dark rounded-xl px-4 py-3 border border-green/40 text-white focus:outline-none focus:ring-2 focus:ring-green"
          autoFocus
        />
        {error && <p className="text-red text-xs">{error}</p>}
        <div className="flex gap-2 justify-end">
          <button
            onClick={handleCancel}
            disabled={isPending}
            className="text-xs font-medium text-gray hover:text-white transition-colors px-3 py-1.5"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={isPending}
            className="text-xs font-bold bg-green text-dark px-4 py-1.5 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-50"
          >
            {isPending ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}
