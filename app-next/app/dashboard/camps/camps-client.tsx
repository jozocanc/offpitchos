'use client'

import { useState } from 'react'
import CampDetailModal from './camp-detail-modal'
import RegisterModal from './register-modal'

interface Camp {
  eventId: string
  title: string
  startTime: string
  endTime: string
  status: string
  team: string | null
  ageGroup: string | null
  venue: string | null
  detailId: string | null
  feeCents: number
  capacity: number | null
  registeredCount: number
  paidCount: number
  expectedRevenue: number
  collectedRevenue: number
}

function formatCurrency(cents: number): string {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 2 })}`
}

export default function CampsClient({ camps, userRole, userProfileId }: { camps: Camp[]; userRole: string; userProfileId: string }) {
  const [selectedCamp, setSelectedCamp] = useState<Camp | null>(null)
  const [registerCamp, setRegisterCamp] = useState<Camp | null>(null)

  const isDoc = userRole === 'doc'
  const isParent = userRole === 'parent'

  // Split into upcoming and past
  const now = new Date()
  const upcoming = camps.filter(c => new Date(c.startTime) >= now)
  const past = camps.filter(c => new Date(c.startTime) < now)

  // Revenue totals
  const totalExpected = camps.reduce((sum, c) => sum + c.expectedRevenue, 0)
  const totalCollected = camps.reduce((sum, c) => sum + c.collectedRevenue, 0)
  const totalRegistered = camps.reduce((sum, c) => sum + c.registeredCount, 0)

  return (
    <div>
      {/* Revenue summary (DOC only) */}
      {isDoc && (
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-dark-secondary border border-white/5 rounded-xl p-5">
            <p className="text-sm text-gray mb-1">Total Registrations</p>
            <p className="text-3xl font-black text-white">{totalRegistered}</p>
          </div>
          <div className="bg-dark-secondary border border-white/5 rounded-xl p-5">
            <p className="text-sm text-gray mb-1">Expected Revenue</p>
            <p className="text-3xl font-black text-green">{formatCurrency(totalExpected)}</p>
          </div>
          <div className="bg-dark-secondary border border-white/5 rounded-xl p-5">
            <p className="text-sm text-gray mb-1">Collected</p>
            <p className="text-3xl font-black text-white">{formatCurrency(totalCollected)}</p>
          </div>
        </div>
      )}

      {/* Upcoming camps */}
      <h2 className="text-lg font-bold text-white mb-4">Upcoming Camps ({upcoming.length})</h2>
      {upcoming.length === 0 ? (
        <p className="text-gray text-sm mb-8">No upcoming camps.</p>
      ) : (
        <div className="space-y-3 mb-8">
          {upcoming.map(camp => (
            <CampCard
              key={camp.eventId}
              camp={camp}
              isDoc={isDoc}
              isParent={isParent}
              onManage={() => setSelectedCamp(camp)}
              onRegister={() => setRegisterCamp(camp)}
            />
          ))}
        </div>
      )}

      {/* Past camps */}
      {past.length > 0 && (
        <>
          <h2 className="text-lg font-bold text-white mb-4">Past Camps ({past.length})</h2>
          <div className="space-y-3 mb-8 opacity-60">
            {past.map(camp => (
              <CampCard
                key={camp.eventId}
                camp={camp}
                isDoc={isDoc}
                isParent={false}
                onManage={() => setSelectedCamp(camp)}
                onRegister={() => {}}
              />
            ))}
          </div>
        </>
      )}

      {/* Modals */}
      {selectedCamp && (
        <CampDetailModal camp={selectedCamp} onClose={() => setSelectedCamp(null)} />
      )}
      {registerCamp && (
        <RegisterModal camp={registerCamp} onClose={() => setRegisterCamp(null)} />
      )}
    </div>
  )
}

function CampCard({ camp, isDoc, isParent, onManage, onRegister }: {
  camp: Camp; isDoc: boolean; isParent: boolean; onManage: () => void; onRegister: () => void
}) {
  const start = new Date(camp.startTime)
  const end = new Date(camp.endTime)
  const dateStr = start.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const timeStr = start.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) +
    ' – ' + end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const fillPct = camp.capacity ? Math.round((camp.registeredCount / camp.capacity) * 100) : null

  return (
    <div className="bg-dark-secondary border border-white/5 rounded-xl p-5 flex items-center justify-between">
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="font-bold text-white">{camp.title}</h3>
          {camp.ageGroup && <span className="text-xs bg-green/10 text-green px-2 py-0.5 rounded">{camp.ageGroup}</span>}
          {camp.status === 'cancelled' && <span className="text-xs bg-red-500/10 text-red-400 px-2 py-0.5 rounded">Cancelled</span>}
        </div>
        <p className="text-sm text-gray">{dateStr} &middot; {timeStr}</p>
        {camp.venue && <p className="text-xs text-gray mt-0.5">{camp.venue}</p>}
        <div className="flex items-center gap-4 mt-2 text-xs text-gray">
          <span>{camp.registeredCount}{camp.capacity ? `/${camp.capacity}` : ''} registered</span>
          {fillPct !== null && <span>{fillPct}% full</span>}
          {camp.feeCents > 0 && <span>{formatCurrency(camp.feeCents)} / player</span>}
          {isDoc && camp.feeCents > 0 && (
            <span className="text-green">{formatCurrency(camp.collectedRevenue)} collected</span>
          )}
        </div>
      </div>
      <div className="flex gap-2">
        {isDoc && (
          <button onClick={onManage} className="text-sm text-green hover:text-green/80 transition-colors">
            Manage
          </button>
        )}
        {isParent && camp.status !== 'cancelled' && (
          <button onClick={onRegister} className="text-sm bg-green text-dark font-semibold px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity">
            Register
          </button>
        )}
      </div>
    </div>
  )
}
