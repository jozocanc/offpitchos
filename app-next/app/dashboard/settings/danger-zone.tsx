'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { leaveClub, deleteAccount } from './actions'
import { useConfirm } from '@/components/confirm-dialog'
import { useToast } from '@/components/toast'

export default function DangerZone({ userRole }: { userRole: string }) {
  const [isPending, startTransition] = useTransition()
  const router = useRouter()
  const { confirm, dialog } = useConfirm()
  const { toast } = useToast()

  async function handleLeave() {
    if (!(await confirm({
      title: 'Leave this program?',
      message: 'You will be removed from the team and lose access. This cannot be undone.',
      confirmLabel: 'Leave',
      destructive: true,
    }))) return
    startTransition(async () => {
      const result = await leaveClub()
      if (result.error) {
        toast(result.error, 'error')
      } else {
        router.push('/login')
      }
    })
  }

  async function handleDelete() {
    // Wording matches what actually happens (migration 037). The account is
    // soft-deleted: display_name is scrubbed to 'Deleted user', club_id is
    // nulled and team memberships are dropped, while the profile row itself
    // survives so the club's history keeps its foreign keys. Sign-in is
    // stopped by banning the auth user rather than deleting it.
    //
    // deleteAccount also anonymises the auth row: the email is replaced with
    // an unroutable placeholder and the name is cleared from user_metadata.
    // Keep this wording in step with that. It previously said the email was
    // kept, which stopped being true.
    if (!(await confirm({
      title: 'Delete your account?',
      message: (
        <>
          <span className="block">Your name and email address will be removed, you will be taken off every team, and you will not be able to sign in again.</span>
          <span className="block mt-2">Anything you posted stays with the team, but is no longer linked to you. This cannot be undone.</span>
        </>
      ),
      confirmLabel: 'Delete',
      destructive: true,
    }))) return
    if (!(await confirm({
      title: 'Are you really sure?',
      message: 'This cannot be undone.',
      confirmLabel: 'Delete account',
      destructive: true,
    }))) return
    startTransition(async () => {
      const result = await deleteAccount()
      if (result.error) {
        toast(result.error, 'error')
      } else {
        router.push('/login')
      }
    })
  }

  return (
    <section className="bg-dark-secondary rounded-2xl p-6 border border-red/20">
      <h2 className="text-lg font-bold mb-4 text-red">Danger zone</h2>
      <div className="space-y-4">
        {userRole !== 'doc' && (
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-sm">Leave program</p>
              <p className="text-gray text-xs">Remove yourself from the team and leave this program.</p>
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
            <p className="font-medium text-sm">Delete account</p>
            {/* Must match what migration 037 actually does. This is a soft
                delete: the profile row survives so the club's history keeps
                its foreign keys, and sign-in is disabled by banning the auth
                user rather than deleting it. */}
            <p className="text-gray text-xs">
              Removes your name and email, takes you off every team, and stops you
              signing in. Anything you posted stays with the team.
            </p>
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
      {dialog}
    </section>
  )
}
