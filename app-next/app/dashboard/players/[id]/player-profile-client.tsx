'use client'

import FeedbackForm from './feedback-form'

interface Feedback {
  id: string
  category: string
  rating: number | null
  notes: string
  created_at: string
  profiles: { display_name: string } | null
  events: { title: string; type: string; start_time: string } | null
}

interface Player {
  first_name: string
  last_name: string
  jersey_number: number | null
  position: string | null
  date_of_birth: string | null
  jersey_size: string | null
  shorts_size: string | null
  teams: { name: string; age_group: string } | null
}

interface RecentEvent {
  id: string
  title: string
  type: string
  start_time: string
}

const CATEGORY_EMOJI: Record<string, string> = {
  technical: '⚽',
  tactical: '🧠',
  physical: '💪',
  attitude: '🌟',
  general: '📝',
}

export default function PlayerProfileClient({ player, feedback, recentEvents, categoryAverages, userRole, playerId }: {
  player: Player
  feedback: Feedback[]
  recentEvents: RecentEvent[]
  categoryAverages: Record<string, { avg: number; count: number }>
  userRole: string
  playerId: string
}) {
  const canAddFeedback = userRole === 'doc' || userRole === 'coach'
  const team = player.teams as any

  return (
    <div>
      {/* Player header */}
      <div className="bg-dark-secondary border border-white/5 rounded-xl p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-black text-white">
              {player.first_name} {player.last_name}
              {player.jersey_number && <span className="text-green ml-2">#{player.jersey_number}</span>}
            </h2>
            <div className="flex items-center gap-3 mt-2 text-sm text-gray">
              {team && <span>{team.name} ({team.age_group})</span>}
              {player.position && <span>· {player.position}</span>}
            </div>
          </div>
          {player.jersey_size && (
            <div className="text-right text-xs text-gray">
              <p>Jersey: {player.jersey_size}</p>
              {player.shorts_size && <p>Shorts: {player.shorts_size}</p>}
            </div>
          )}
        </div>

        {/* Category averages */}
        {Object.keys(categoryAverages).length > 0 && (
          <div className="flex flex-wrap gap-3 mt-4 pt-4 border-t border-white/5">
            {Object.entries(categoryAverages).map(([cat, data]) => (
              <div key={cat} className="bg-dark rounded-lg px-3 py-2 text-center">
                <p className="text-xs text-gray capitalize">{CATEGORY_EMOJI[cat]} {cat}</p>
                <p className="text-lg font-bold text-green">{data.avg}</p>
                <p className="text-xs text-gray">{data.count} reviews</p>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Feedback form (coaches/DOC) */}
        {canAddFeedback && (
          <div className="lg:col-span-1">
            <FeedbackForm playerId={playerId} recentEvents={recentEvents} />
          </div>
        )}

        {/* Feedback timeline */}
        <div className={canAddFeedback ? 'lg:col-span-2' : 'lg:col-span-3'}>
          <h3 className="font-bold text-white mb-4">Development Timeline ({feedback.length})</h3>

          {feedback.length === 0 ? (
            <p className="text-gray text-sm">No feedback yet.</p>
          ) : (
            <div className="space-y-3">
              {feedback.map(f => {
                const coachName = (f.profiles as any)?.display_name ?? 'Coach'
                const event = f.events as any
                const date = new Date(f.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

                return (
                  <div key={f.id} className="bg-dark-secondary border border-white/5 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span>{CATEGORY_EMOJI[f.category] ?? '📝'}</span>
                        <span className="text-xs font-medium text-white capitalize">{f.category}</span>
                        {f.rating && (
                          <span className="text-xs bg-green/10 text-green px-1.5 py-0.5 rounded">{f.rating}/5</span>
                        )}
                      </div>
                      <span className="text-xs text-gray">{date}</span>
                    </div>
                    <p className="text-sm text-white/80 mb-2">{f.notes}</p>
                    <div className="flex items-center gap-2 text-xs text-gray">
                      <span>— {coachName}</span>
                      {event && (
                        <span>· {event.title} ({new Date(event.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })})</span>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
