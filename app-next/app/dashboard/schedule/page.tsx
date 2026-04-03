import { getScheduleData } from './actions'
import ScheduleClient from './schedule-client'

export default async function SchedulePage() {
  const data = await getScheduleData()

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <ScheduleClient
        events={data.events}
        teams={data.teams}
        venues={data.venues}
        userRole={data.userRole}
      />
    </div>
  )
}
