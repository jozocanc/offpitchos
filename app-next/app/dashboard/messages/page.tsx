import type { Metadata } from 'next'
import { getMessagesData } from './actions'
import MessagesClient from './messages-client'

export const metadata: Metadata = { title: 'Messages' }

export default async function MessagesPage() {
  const data = await getMessagesData()

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <MessagesClient
        announcements={data.announcements}
        teams={data.teams}
        userRole={data.userRole}
        userProfileId={data.userProfileId}
      />
    </div>
  )
}
