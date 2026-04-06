import { Metadata } from 'next'
import { getCampsData } from './actions'
import CampsClient from './camps-client'

export const metadata: Metadata = {
  title: 'Camps',
}

export default async function CampsPage() {
  const { camps, userRole, userProfileId } = await getCampsData()

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Camps</h1>
        <p className="text-sm text-gray mt-1">Manage camps, registrations, and revenue.</p>
      </div>

      <CampsClient camps={camps} userRole={userRole} userProfileId={userProfileId} />
    </div>
  )
}
