import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import VenuesSection from './venues-section'
import CoverageSettings from './coverage-settings'
import AccountSettings from './account-settings'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id, display_name, role')
    .eq('user_id', user.id)
    .single()

  const { data: club } = await supabase
    .from('clubs')
    .select('id, name')
    .eq('id', profile?.club_id ?? '')
    .single()

  const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'

  return (
    <div className="p-6 md:p-10 max-w-3xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-black tracking-tight">Settings</h1>
        <p className="text-gray text-sm mt-1">Manage your club settings</p>
      </div>

      <div className="space-y-6">
        <AccountSettings
          clubName={club?.name ?? ''}
          displayName={profile?.display_name ?? ''}
          email={user.email ?? ''}
          isDOC={profile?.role === 'doc'}
        />

        {/* Club invite link */}
        <section className="bg-dark-secondary rounded-2xl p-6 border border-white/5">
          <h2 className="text-lg font-bold mb-2">Club Coaches Link</h2>
          <p className="text-gray text-sm mb-4">
            Use the Coaches page to generate invite links for specific coaches or teams.
          </p>
          <a
            href="/dashboard/coaches"
            className="inline-block text-sm font-bold text-green hover:underline"
          >
            Go to Coaches page →
          </a>
        </section>

        <VenuesSection />

        {profile?.role === 'doc' && <CoverageSettings />}

        {/* Future settings placeholder */}
        <section className="bg-dark-secondary rounded-2xl p-6 border border-white/5 opacity-50">
          <h2 className="text-lg font-bold mb-2">Notifications</h2>
          <p className="text-gray text-sm">Coming soon — configure email and push notification preferences.</p>
        </section>

        <section className="bg-dark-secondary rounded-2xl p-6 border border-white/5 opacity-50">
          <h2 className="text-lg font-bold mb-2">Billing</h2>
          <p className="text-gray text-sm">Coming soon — manage your subscription and billing details.</p>
        </section>
      </div>
    </div>
  )
}
