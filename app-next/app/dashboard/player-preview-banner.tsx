import type { PreviewPlayer } from '@/lib/admin-role'

// Slim strip at the top of the dashboard while a head coach uses
// "View as → Player". Server component: no interactivity needed.
export default function PlayerPreviewBanner({ player }: { player: PreviewPlayer | null }) {
  return (
    <div className="border-b border-green/20 bg-green/5 px-4 py-2 text-xs text-gray md:px-10">
      {player ? (
        <p>
          Viewing as{' '}
          <span className="font-bold text-white">
            {player.firstName} {player.lastName}
            {player.jerseyNumber !== null && ` (#${player.jerseyNumber})`}
          </span>
          , a player on <span className="font-bold text-green">{player.teamName}</span>. Switch back
          with View as → Coach.
        </p>
      ) : (
        <p>
          Player preview needs at least one player who has joined your team. Invite a player, then
          come back. Switch back with View as → Coach.
        </p>
      )}
    </div>
  )
}
