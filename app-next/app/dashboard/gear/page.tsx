import { Metadata } from 'next'
import { getGearData } from './actions'
import GearClient from './gear-client'

export const metadata: Metadata = {
  title: 'Gear',
}

export default async function GearPage() {
  const { teams, userRole } = await getGearData()

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Gear</h1>
        <p className="text-sm text-gray mt-1">Player sizes and gear order summaries.</p>
      </div>

      <GearClient teams={teams} userRole={userRole} />
    </div>
  )
}
