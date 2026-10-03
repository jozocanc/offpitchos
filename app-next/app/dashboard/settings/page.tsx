import type { Metadata } from 'next'
import { appUrl } from '@/lib/app-url'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import VenuesSection from './venues-section'

export const metadata: Metadata = { title: 'Settings' }
import AccountSettings from './account-settings'
import { getClubTimezone } from '@/lib/club-timezone-server'
import DangerZone from './danger-zone'
import StripeConnect from './stripe-connect'
import { isStaff } from '@/lib/constants'
import { getEffectiveRole } from '@/lib/admin-role'

export default async function SettingsPage() {
  const supabase = await createClient()
  const timezone = await getClubTimezone()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id, display_name, role, staff_title')
    .eq('user_id', user.id)
    .single()

  // Staff-only page. Was `role === 'parent'`, which would have let a player in.
  if (!isStaff(await getEffectiveRole(profile?.role ?? 'player'))) redirect('/dashboard')

  const { data: club } = await supabase
    .from('clubs')
    .select('id, name')
    .eq('id', profile?.club_id ?? '')
    .single()

  const baseUrl = appUrl()

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-black tracking-tight">Settings</h1>
        <p className="text-gray text-sm mt-1">Manage your program and your account.</p>
      </div>

      <div className="space-y-6">
        <AccountSettings
          clubName={club?.name ?? ''}
          displayName={profile?.display_name ?? ''}
          email={user.email ?? ''}
          isDOC={profile?.role === 'doc'}
          role={profile?.role}
          staffTitle={profile?.staff_title}
          timezone={timezone}
        />

        {/* Staff invites */}
        {profile?.role === 'doc' && (
          <section className="bg-dark-secondary rounded-2xl p-6 border border-white/5">
            <h2 className="text-lg font-bold mb-2">Staff invites</h2>
            <p className="text-gray text-sm mb-4">
              Invite assistant, goalkeeping and fitness coaches from the Staff page.
            </p>
            <Link
              href="/dashboard/coaches"
              className="inline-block text-sm font-bold text-green hover:underline"
            >
              Go to Staff →
            </Link>
          </section>
        )}

        {profile?.role === 'doc' && (
          <section className="bg-dark-secondary rounded-2xl p-6 border border-white/5">
            <h2 className="text-lg font-bold mb-2">Roster import</h2>
            <p className="text-gray text-sm mb-4">
              Bring in your players from any roster file: PDF, screenshot, photo, Excel, CSV or Word.
            </p>
            <Link
              href="/dashboard/roster-import"
              className="inline-block text-sm font-bold text-green hover:underline"
            >
              Import a roster →
            </Link>
          </section>
        )}

        {profile?.role === 'doc' && <VenuesSection />}

        {profile?.role === 'doc' && <StripeConnect />}

        <DangerZone userRole={profile?.role ?? 'player'} />

        <section className="bg-dark-secondary rounded-2xl p-6 border border-white/5">
          <h2 className="text-lg font-bold mb-2">Legal</h2>
          <p className="text-gray text-sm mb-4">
            We never sell your data or train AI models on your team&rsquo;s information.
          </p>
          <div className="flex gap-4 text-sm font-bold">
            <a href="/privacy" className="text-green hover:underline">Privacy Policy →</a>
            <a href="/terms" className="text-green hover:underline">Terms of Service →</a>
          </div>
        </section>
      </div>
    </div>
  )
}
