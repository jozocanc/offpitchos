import { Metadata } from 'next'
import Wordmark from '@/components/wordmark'
import { getCollectPlayer } from './actions'
import CollectForm from './collect-form'

export const metadata: Metadata = {
  title: 'Your details',
  // A private per-player link has no business in a search index.
  robots: { index: false, follow: false },
}

export default async function CollectPage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const player = await getCollectPlayer(token)

  if (!player) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-dark px-4">
        <div className="w-full max-w-md text-center">
          <Wordmark size="xl" className="mb-2" />
          <div className="bg-dark-secondary rounded-2xl p-8 mt-8 border border-red/20">
            <p className="text-red text-lg font-bold mb-2">Link Not Valid</p>
            <p className="text-gray text-sm">
              This link does not match a player. Ask your coach to resend it.
            </p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-dark px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Wordmark size="xl" className="mb-2" />
          <p className="text-gray">
            {player.firstName} {player.lastName}
            {player.teamName && <span className="block text-sm mt-1">{player.teamName}</span>}
          </p>
        </div>

        <CollectForm token={token} player={player} />
      </div>
    </main>
  )
}
