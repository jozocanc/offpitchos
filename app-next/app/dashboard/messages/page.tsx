import type { Metadata } from 'next'
import { getMessagesData } from './actions'
import MessagesClient from './messages-client'

export const metadata: Metadata = { title: 'Messages' }

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; dm?: string }>
}) {
  const data = await getMessagesData()
  const params = await searchParams

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <MessagesClient
        announcements={data.announcements}
        teams={data.teams}
        userRole={data.userRole}
        userProfileId={data.userProfileId}
        audienceByTeam={data.audienceByTeam}
        clubWideAudience={data.clubWideAudience}
        initialTab={params.tab === 'dm' || params.dm ? 'dm' : 'announcements'}
        initialDMUserId={params.dm}
      />
    </div>
  )
}
