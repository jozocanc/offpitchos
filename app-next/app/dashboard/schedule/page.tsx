import type { Metadata } from 'next'
import { getScheduleData } from './actions'
import ScheduleClient from './schedule-client'

export const metadata: Metadata = { title: 'Schedule' }

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ team?: string; highlight?: string }>
}) {
  const data = await getScheduleData()
  const { team: initialTeam, highlight: initialHighlight } = await searchParams

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <ScheduleClient
        events={data.events}
        teams={data.teams}
        venues={data.venues}
        userRole={data.userRole}
        coverageRequests={data.coverageRequests}
        userProfileId={data.userProfileId}
        initialTeamFilter={initialTeam ?? null}
        initialHighlight={initialHighlight ?? null}
      />
    </div>
  )
}
