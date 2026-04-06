import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/sidebar'
import { ToastProvider } from '@/components/toast'

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

  return (
    <div className="flex min-h-screen bg-dark">
      <Sidebar userEmail={user.email ?? ''} userRole={profile.role ?? 'parent'} />
      <ToastProvider>
        <main className="flex-1 overflow-auto">
          {children}
        </main>
      </ToastProvider>
    </div>
  )
}
