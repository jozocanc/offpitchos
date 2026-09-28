'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { updateClubTimezone } from './actions'
import { useToast } from '@/components/toast'
import { TEAM_TIMEZONES } from '@/lib/constants'

export default function TimezoneSelect({ timezone, canEdit }: { timezone: string; canEdit: boolean }) {
  const { toast } = useToast()
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const known = TEAM_TIMEZONES.some(t => t.value === timezone)

  function handleChange(next: string) {
    startTransition(async () => {
      const result = await updateClubTimezone(next)
      if ('error' in result && result.error) {
        toast(result.error, 'error')
        return
      }
      toast('Timezone updated. All times now show in this zone.', 'success')
      router.refresh()
    })
  }

  return (
    <div>
      <label className="block text-sm font-medium text-gray mb-1" htmlFor="team-timezone">Timezone</label>
      <select
        id="team-timezone"
        defaultValue={timezone}
        disabled={!canEdit || isPending}
        onChange={e => handleChange(e.target.value)}
        className="w-full bg-dark border border-white/10 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-green transition-colors appearance-none disabled:opacity-70"
      >
        {!known && <option value={timezone}>{timezone}</option>}
        {TEAM_TIMEZONES.map(t => (
          <option key={t.value} value={t.value}>{t.label}</option>
        ))}
      </select>
      <p className="text-gray text-xs mt-1">Every practice, game and bus time is shown in this zone.</p>
    </div>
  )
}
