'use client'

import { createContext, useContext } from 'react'
import { DEFAULT_TIMEZONE } from '@/lib/format-datetime'

/**
 * Carries the club's IANA timezone to every client component under the
 * dashboard layout, so date formatting is identical on the server and after
 * hydration.
 *
 * A context rather than props because the alternative is threading the same
 * string through page -> ScheduleClient -> AgendaView -> EventCard and the
 * equivalent chain in 20+ other files. Missing one reintroduces the bug
 * silently, since a wrong timezone still renders a plausible-looking time.
 *
 * The default exists only so a component rendered outside the provider (a
 * test, or a public page) still produces stable output rather than throwing.
 * Inside the dashboard the provider always supplies the real value.
 */
const ClubTimezoneContext = createContext<string>(DEFAULT_TIMEZONE)

export function ClubTimezoneProvider({
  timezone,
  children,
}: {
  timezone: string
  children: React.ReactNode
}) {
  return (
    <ClubTimezoneContext value={timezone}>
      {children}
    </ClubTimezoneContext>
  )
}

export function useClubTimezone(): string {
  return useContext(ClubTimezoneContext)
}
