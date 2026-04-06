import { Metadata } from 'next'
import { getAnalyticsData } from './actions'
import AnalyticsClient from './analytics-client'

export const metadata: Metadata = {
  title: 'Analytics',
}

export default async function AnalyticsPage() {
  const data = await getAnalyticsData()

  return (
    <div className="p-6 md:p-10 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Analytics</h1>
        <p className="text-sm text-gray mt-1">Your club at a glance.</p>
      </div>

      <AnalyticsClient data={data} />
    </div>
  )
}
