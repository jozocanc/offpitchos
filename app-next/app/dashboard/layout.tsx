import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import Sidebar from '@/components/sidebar'
import { ToastProvider } from '@/components/toast'

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
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </ToastProvider>
    </div>
  )
}
