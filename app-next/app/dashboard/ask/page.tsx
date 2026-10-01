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
    <div className="flex flex-col h-[calc(100dvh-60px-env(safe-area-inset-bottom)-env(safe-area-inset-top))] md:h-[100dvh] max-w-3xl mx-auto p-6 md:px-10 md:py-8">
      <div className="mb-4 shrink-0">
        <h1 className="text-2xl font-bold text-white">Ask Pep</h1>
        <p className="text-sm text-gray mt-1">Get instant answers about your team: schedule, events, staff, and more.</p>
      </div>

      {userRole === 'doc' && (
        <div className="shrink-0">
          <AiLogClient />
        </div>
      )}

      <div className="flex-1 min-h-0">
        <AskClient chatHistory={chatHistory} userRole={userRole} />
      </div>
    </div>
  )
}
