import type { Metadata } from 'next'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { isStaff } from '@/lib/constants'
import ImportWizard from './import-wizard'
import FileImport from './file-import'

export const metadata: Metadata = { title: 'Roster Import' }

export default async function RosterImportPage({
  searchParams,
}: {
  searchParams: Promise<{ csv?: string }>
}) {
  const { csv } = await searchParams
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id, role')
    .eq('user_id', user.id)
    .single()

  if (!profile?.club_id || !isStaff(profile.role)) redirect('/dashboard')
  const isDoc = isStaff(profile.role)

  // The CSV mapper also creates player accounts from emails.
  if (csv === '1' && isDoc) {
    return (
      <div className="p-6 md:p-10 max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-black tracking-tight">Roster Import</h1>
          <p className="text-gray text-sm mt-1">
            CSV with player emails: each player gets an account and a set-your-password email.{' '}
            <Link href="/dashboard/roster-import" className="text-green hover:underline">Import any file instead</Link>
          </p>
        </div>
        <ImportWizard variant="dashboard" />
      </div>
    )
  }

  const { data: teams } = await supabase
    .from('teams')
    .select('id, name')
    .eq('club_id', profile.club_id)
    .order('created_at')

  return (
    <div className="p-4 md:p-10 max-w-6xl mx-auto">
      <div className="mb-6 md:mb-8">
        <h1 className="text-3xl font-black tracking-tight">Roster Import</h1>
        <p className="text-gray text-sm mt-1">Bring in your players from whatever roster file you already have.</p>
      </div>
      <FileImport teams={teams ?? []} />
      {isDoc && (
        <p className="text-center text-gray text-xs mt-6">
          Have a CSV with player emails and want to send invites from here?{' '}
          <Link href="/dashboard/roster-import?csv=1" className="text-green hover:underline">Use the CSV import</Link>
        </p>
      )}
    </div>
  )
}
