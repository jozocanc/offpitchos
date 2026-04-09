import { Metadata } from 'next'
import { getPlayerProfile } from './actions'
import PlayerProfileClient from './player-profile-client'

export const metadata: Metadata = {
  title: 'Player Profile',
}

export default async function PlayerProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { player, feedback, recentEvents, categoryAverages, userRole, isParent } = await getPlayerProfile(id)

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <PlayerProfileClient
        player={player as any}
        feedback={feedback as any}
        recentEvents={recentEvents}
        categoryAverages={categoryAverages}
        userRole={userRole}
        playerId={id}
        isParent={isParent}
      />
    </div>
  )
}
