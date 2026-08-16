import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/sidebar'
import { ToastProvider } from '@/components/toast'
import VoiceCommand from '@/components/voice-command'
import { VoiceFocusProvider } from '@/components/voice-context'
import { canSwitchRole, getEffectiveRole } from '@/lib/admin-role'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  // getClaims verifies the JWT locally (asymmetric signing keys) — no network
  // round-trip. Middleware already validated + refreshed the session.
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims

  if (!claims) redirect('/login')

  // Check onboarding status
  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_complete, role')
    .eq('user_id', claims.sub)
    .single()

  if (!profile || !profile.onboarding_complete) {
    redirect('/onboarding')
  }

  // "Preview as" — a DOC can view the app as one of their coaches or parents.
  const actualRole = profile.role ?? 'parent'
  const effectiveRole = await getEffectiveRole(actualRole)

  return (
    <div className="flex min-h-screen bg-dark">
      <Sidebar
        userEmail={claims.email ?? ''}
        userRole={effectiveRole}
        canSwitchRole={canSwitchRole(actualRole)}
      />
      <ToastProvider>
        <VoiceFocusProvider>
          {/* pt-14 on mobile clears the fixed hamburger button (top-4 + ~38px
              button = 54px footprint) so page headers don't render underneath
              it. md:pt-0 because the sidebar is static on desktop and the
              hamburger isn't rendered. */}
          <main className="flex-1 overflow-auto pt-14 md:pt-0">
            {children}
          </main>
          <VoiceCommand userRole={effectiveRole} />
        </VoiceFocusProvider>
      </ToastProvider>
    </div>
  )
}
