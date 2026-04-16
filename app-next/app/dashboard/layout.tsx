import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import Sidebar from '@/components/sidebar'
import { ToastProvider } from '@/components/toast'
import VoiceCommand from '@/components/voice-command'
import { VoiceFocusProvider } from '@/components/voice-context'

const ADMIN_EMAIL = 'jozo.cancar27@gmail.com'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  // Check onboarding status
  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_complete, role')
    .eq('user_id', user.id)
    .single()

  if (!profile || !profile.onboarding_complete) {
    redirect('/onboarding')
  }

  // Admin role switcher — read cookie
  let effectiveRole = profile.role ?? 'parent'
  if (user.email === ADMIN_EMAIL) {
    const cookieStore = await cookies()
    const viewAs = cookieStore.get('viewAsRole')?.value
    if (viewAs && ['doc', 'coach', 'parent'].includes(viewAs)) {
      effectiveRole = viewAs
    }
  }

  return (
    <div className="flex min-h-screen bg-dark">
      <Sidebar userEmail={user.email ?? ''} userRole={effectiveRole} />
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
