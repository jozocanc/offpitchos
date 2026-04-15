'use client'

import { useState } from 'react'
import { ROLES } from '@/lib/constants'
import AnnouncementCard from './announcement-card'
import NewAnnouncementModal from './new-announcement-modal'
import DMClient from './dm-client'

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
  initialTab?: 'announcements' | 'dm'
  initialDMUserId?: string
}

export default function MessagesClient({
  announcements,
  teams,
  userRole,
  userProfileId,
  audienceByTeam,
  clubWideAudience,
  initialTab = 'announcements',
  initialDMUserId,
}: MessagesClientProps) {
  const [filterTeam, setFilterTeam] = useState<string>('')
  const [modalOpen, setModalOpen] = useState(false)
  const [tab, setTab] = useState<'announcements' | 'dm'>(initialTab)

  // All roles can post messages — DOC for club announcements, coaches for
  // team updates, parents for communicating with their kid's coaches.
  const canPost = userRole === ROLES.DOC || userRole === ROLES.COACH || userRole === ROLES.PARENT

  const filtered = announcements.filter(a => {
    if (!filterTeam) return true
    if (filterTeam === 'club-wide') return a.team_id === null
    return a.team_id === filterTeam
  })

  return (
    <>
      <div className="mb-6">
        <h1 className="text-3xl font-black tracking-tight">Messages</h1>
      </div>

      <div className="flex gap-2 mb-6 border-b border-white/5">
        <button
          onClick={() => setTab('announcements')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            tab === 'announcements' ? 'text-green border-green' : 'text-gray border-transparent hover:text-white'
          }`}
        >
          Announcements
        </button>
        <button
          onClick={() => setTab('dm')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors ${
            tab === 'dm' ? 'text-green border-green' : 'text-gray border-transparent hover:text-white'
          }`}
        >
          Direct
        </button>
      </div>

      {tab === 'dm' ? (
        <DMClient initialOpenUserId={initialDMUserId} />
      ) : (
      <>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <p className="text-gray text-sm">
          {filtered.length} announcement{filtered.length !== 1 ? 's' : ''}
        </p>
        {canPost && (
          <button
            onClick={() => setModalOpen(true)}
            className="bg-green text-dark font-bold px-5 py-2.5 rounded-xl hover:opacity-90 transition-opacity text-sm"
          >
            {userRole === ROLES.PARENT ? 'Message Coach' : '+ New Announcement'}
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
      )}
    </>
  )
}
