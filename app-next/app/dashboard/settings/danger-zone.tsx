'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { leaveClub, deleteAccount } from './actions'

export default function DangerZone({ userRole }: { userRole: string }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleLeave() {
    if (!confirm('Leave this club? You will be removed from all teams and lose access. This cannot be undone.')) return
    startTransition(async () => {
      const result = await leaveClub()
      if (result.error) {
        alert(result.error)
      } else {
        router.push('/login')
      }
    })
  }

  function handleDelete() {
    // Wording matches what actually happens (migration 037). The account is
    // soft-deleted: personal details are scrubbed and sign-in is disabled, but
    // things you authored stay with the club so its records don't develop
    // holes. Promising "all your data is permanently removed" would not be
    // true, and a deletion promise is the wrong place to be loose.
    if (!confirm(
      'Delete your account?\n\n' +
      'Your name and personal details will be removed, you will be taken off every team, and you will not be able to sign in again.\n\n' +
      'Anything you posted or recorded stays with the club, but is no longer linked to your name. This cannot be undone.'
    )) return
    if (!confirm('Are you really sure? This cannot be undone.')) return
    startTransition(async () => {
      const result = await deleteAccount()
      if (result.error) {
        alert(result.error)
      } else {
        router.push('/login')
      }
    })
  }

  return (
    <section className="bg-dark-secondary rounded-2xl p-6 border border-red/20">
      <h2 className="text-lg font-bold mb-4 text-red">Danger Zone</h2>
      <div className="space-y-4">
        {userRole !== 'doc' && (
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Leave Club</p>
              <p className="text-gray text-xs">Remove yourself from all teams and leave this club.</p>
            </div>
            <button
              onClick={handleLeave}
              disabled={isPending}
              className="text-sm font-medium text-red border border-red/30 px-4 py-2 rounded-lg hover:bg-red/10 transition-colors disabled:opacity-50"
            >
              {isPending ? 'Leaving...' : 'Leave'}
            </button>
          </div>
        )}
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-sm">Delete Account</p>
            <p className="text-gray text-xs">Permanently delete your account and all associated data.</p>
          </div>
          <button
            onClick={handleDelete}
            disabled={isPending}
            className="text-sm font-medium text-red border border-red/30 px-4 py-2 rounded-lg hover:bg-red/10 transition-colors disabled:opacity-50"
          >
            {isPending ? 'Deleting...' : 'Delete'}
          </button>
        </div>
      </div>
    </section>
  )
}
