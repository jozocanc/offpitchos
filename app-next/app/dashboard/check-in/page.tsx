import type { Metadata } from 'next'
import Link from 'next/link'
import { getMyCheckinState } from './actions'
import CheckinForm from './checkin-form'
import { formatDayKeyLong } from '@/lib/format-datetime'

export const metadata: Metadata = { title: 'Check-in' }

// Deep-link target of the 8 AM push (/api/cron/checkin-reminders). Same form
// as the dashboard card, full width so it is one thumb-tap per row on a phone.
export default async function CheckinPage() {
  const state = await getMyCheckinState()

  return (
    <div className="p-4 sm:p-6 md:p-10 max-w-xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Check-in</h1>
        <p className="text-sm text-gray mt-1">
          {state.today ? formatDayKeyLong(state.today) : 'Daily readiness for the staff.'}
        </p>
      </div>

      {state.player ? (
        <CheckinForm
          key={state.checkin?.updatedAt ?? 'new'}
          initial={state.checkin}
          firstName={state.player.firstName}
          isPreview={state.isPreview}
          variant="page"
        />
      ) : (
        <div className="bg-dark-secondary rounded-2xl border border-white/5 p-6 text-center">
          <p className="font-bold">No roster spot linked to this account</p>
          <p className="text-gray text-sm mt-1">
            The daily check-in is for players. Once your account is linked to the roster, it shows up here.
          </p>
          <Link href="/dashboard" className="inline-block mt-4 text-sm font-bold text-green hover:opacity-80">
            Back to dashboard
          </Link>
        </div>
      )}
    </div>
  )
}
