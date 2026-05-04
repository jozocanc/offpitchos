import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ResetForm from './reset-form'

export const metadata = { title: 'Set your password' }

export default async function ResetPasswordPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <main className="min-h-screen flex items-center justify-center bg-dark px-4">
      <ResetForm email={user.email ?? ''} />
    </main>
  )
}
