'use client'

import { useTransition } from 'react'
import { updateCoachTitle } from './actions'
import { useToast } from '@/components/toast'
import { STAFF_TITLES } from '@/lib/constants'

export default function TitleSelect({ profileId, title }: { profileId: string; title: string }) {
  const { toast } = useToast()
  const [isPending, startTransition] = useTransition()

  function handleChange(next: string) {
    startTransition(async () => {
      const result = await updateCoachTitle(profileId, next)
      if (!result.ok) toast(result.error, 'error')
      else toast(`Title set to ${next}`, 'success')
    })
  }

  return (
    <select
      aria-label="Staff title"
      defaultValue={title}
      disabled={isPending}
      onChange={e => handleChange(e.target.value)}
      className="bg-transparent text-gray text-xs -ml-1 pr-1 rounded focus:outline-none focus:text-white hover:text-white cursor-pointer disabled:opacity-60"
    >
      {STAFF_TITLES.map(t => (
        <option key={t} value={t} className="bg-dark">{t}</option>
      ))}
    </select>
  )
}
