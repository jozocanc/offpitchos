import type { Metadata } from 'next'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import ImportWizard from './import-wizard'

export const metadata: Metadata = { title: 'Roster Import' }

export default async function RosterImportPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id, role')
    .eq('user_id', user.id)
    .single()

  if (!profile?.club_id || profile.role !== 'doc') redirect('/dashboard')

  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-black tracking-tight">Roster Import</h1>
        <p className="text-gray text-sm mt-1">Import your roster from a CSV file.</p>
      </div>
      <ImportWizard variant="dashboard" />
    </div>
  )
}
