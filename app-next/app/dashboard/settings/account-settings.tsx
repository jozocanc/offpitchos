'use client'

import EditableField from './editable-field'
import { updateDisplayName, updateClubName } from './actions'

interface AccountSettingsProps {
  clubName: string
  displayName: string
  email: string
  isDOC: boolean
  role?: string
}

function roleLabel(role?: string): string {
  if (role === 'doc') return 'Director of Coaching'
  if (role === 'coach') return 'Coach'
  if (role === 'parent') return 'Parent'
  return 'Member'
}

export default function AccountSettings({ clubName, displayName, email, isDOC, role }: AccountSettingsProps) {
  return (
    <>
      {/* Club info */}
      <section className="bg-dark-secondary rounded-2xl p-6 border border-white/5">
        <h2 className="text-lg font-bold mb-4">Club Information</h2>
        <div className="space-y-4">
          {isDOC ? (
            <EditableField
              label="Club Name"
              value={clubName}
              onSave={updateClubName}
            />
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray mb-1">Club Name</label>
              <div className="bg-dark rounded-xl px-4 py-3 border border-white/5">
                <p className="text-white">{clubName || '—'}</p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Account info */}
      <section className="bg-dark-secondary rounded-2xl p-6 border border-white/5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Account</h2>
          <span className="text-xs font-semibold bg-green/10 text-green border border-green/20 rounded-full px-3 py-1">
            {roleLabel(role)}
          </span>
        </div>
        <div className="space-y-4">
          <EditableField
            label="Display Name"
            value={displayName}
            onSave={updateDisplayName}
          />
          <div>
            <label className="block text-sm font-medium text-gray mb-1">Email</label>
            <div className="bg-dark rounded-xl px-4 py-3 border border-white/5">
              <p className="text-white">{email || '—'}</p>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
