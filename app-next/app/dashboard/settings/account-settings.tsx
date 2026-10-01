'use client'

import EditableField from './editable-field'
import { updateDisplayName, updateClubName } from './actions'
import TimezoneSelect from './timezone-select'
import { roleLabel } from '@/lib/constants'

interface AccountSettingsProps {
  clubName: string
  displayName: string
  email: string
  isDOC: boolean
  role?: string
  staffTitle?: string | null
  timezone?: string
}


export default function AccountSettings({ clubName, displayName, email, isDOC, role, staffTitle, timezone }: AccountSettingsProps) {
  return (
    <>
      {/* Program info (stored on the clubs table) */}
      <section className="bg-dark-secondary rounded-2xl p-6 border border-white/5">
        <h2 className="text-lg font-bold mb-2">Program</h2>
        <p className="text-gray text-sm mb-4">
          The name your staff and players see, e.g. Tyler Junior College Men&apos;s Soccer.
        </p>
        <div className="space-y-4">
          {isDOC ? (
            <EditableField
              label="Program name"
              value={clubName}
              onSave={updateClubName}
            />
          ) : (
            <div>
              <label className="block text-sm font-medium text-gray mb-1">Program name</label>
              <div className="bg-dark rounded-xl px-4 py-3 border border-white/5">
                <p className="text-white">{clubName || 'Not set'}</p>
              </div>
            </div>
          )}
          {timezone && <TimezoneSelect timezone={timezone} canEdit={isDOC} />}
        </div>
      </section>

      {/* Account info */}
      <section className="bg-dark-secondary rounded-2xl p-6 border border-white/5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">Account</h2>
          <span className="text-xs font-semibold bg-green/10 text-green border border-green/20 rounded-full px-3 py-1">
            {roleLabel(role, staffTitle)}
          </span>
        </div>
        <div className="space-y-4">
          <EditableField
            label="Your name"
            value={displayName}
            onSave={updateDisplayName}
          />
          <div>
            <label className="block text-sm font-medium text-gray mb-1">Email</label>
            <div className="bg-dark rounded-xl px-4 py-3 border border-white/5">
              <p className="text-white">{email || 'Not set'}</p>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
