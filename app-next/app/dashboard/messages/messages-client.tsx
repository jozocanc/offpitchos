'use client'

import { useState } from 'react'
import { ROLES } from '@/lib/constants'
import AnnouncementCard from './announcement-card'
import NewAnnouncementModal from './new-announcement-modal'

interface Team {
  id: string
  name: string
  age_group: string
}

interface AudienceCounts {
  parents: number
  coaches: number
}

interface MessagesClientProps {
  announcements: any[]
  teams: Team[]
  userRole: string
  userProfileId: string
  audienceByTeam: Record<string, AudienceCounts>
  clubWideAudience: AudienceCounts
}

export default function MessagesClient({
  announcements,
  teams,
  userRole,
  userProfileId,
  audienceByTeam,
  clubWideAudience,
}: MessagesClientProps) {
  const [filterTeam, setFilterTeam] = useState<string>('')
  const [modalOpen, setModalOpen] = useState(false)

  const canPost = userRole === ROLES.DOC

  const filtered = announcements.filter(a => {
    if (!filterTeam) return true
    if (filterTeam === 'club-wide') return a.team_id === null
    return a.team_id === filterTeam
  })

  return (
    <>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight">Messages</h1>
          <p className="text-gray text-sm mt-1">
            {filtered.length} announcement{filtered.length !== 1 ? 's' : ''}
          </p>
        </div>
        {canPost && (
          <button
            onClick={() => setModalOpen(true)}
            className="bg-green text-dark font-bold px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity text-sm"
          >
            + New Announcement
          </button>
        )}
      </div>

      <div className="mb-6">
        <select
          value={filterTeam}
          onChange={e => setFilterTeam(e.target.value)}
          className="bg-dark border border-white/10 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-green transition-colors appearance-none"
        >
          <option value="">All</option>
          <option value="club-wide">Club-Wide Only</option>
          {teams.map(t => (
            <option key={t.id} value={t.id}>{t.name} ({t.age_group})</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-dark-secondary rounded-2xl p-12 text-center border border-white/5">
          <p className="text-gray text-lg">No announcements yet.</p>
          <p className="text-gray text-sm mt-1">
            {canPost ? 'Post your first announcement to get started.' : 'Announcements from your coaches will appear here.'}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map(a => (
            <AnnouncementCard
              key={a.id}
              announcement={a}
              userProfileId={userProfileId}
              userRole={userRole}
            />
          ))}
        </div>
      )}

      {modalOpen && (
        <NewAnnouncementModal
          teams={teams}
          userRole={userRole}
          audienceByTeam={audienceByTeam}
          clubWideAudience={clubWideAudience}
          onClose={() => setModalOpen(false)}
        />
      )}
    </>
  )
}
