import { Metadata } from 'next'
import { getAskPageData } from './actions'
import AskClient from './ask-client'
import AiLogClient from './ai-log-client'

export const metadata: Metadata = {
  title: 'Ask',
}

export default async function AskPage() {
  const { chatHistory, userRole } = await getAskPageData()

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Ask Ref</h1>
        <p className="text-sm text-gray mt-1">Get instant answers about your club — schedule, teams, events, and more.</p>
      </div>

      {userRole === 'doc' && <AiLogClient />}

      <AskClient chatHistory={chatHistory} userRole={userRole} />
    </div>
  )
}
