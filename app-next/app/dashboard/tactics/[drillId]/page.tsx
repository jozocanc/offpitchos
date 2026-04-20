import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { DrillRowSchema } from '@/lib/tactics/object-schema'
import EditorClient from './editor-client'
import ReadonlyView from './readonly-view'

export default async function DrillPage({
  params, searchParams,
}: {
  params: Promise<{ drillId: string }>
  searchParams: Promise<{ readonly?: string }>
}) {
  const { drillId } = await params
  const { readonly } = await searchParams
  const isReadonly = readonly === '1'

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/access')
  const { data: profile } = await supabase
    .from('profiles').select('id, role, club_id').eq('user_id', user.id).single()
  if (!profile?.club_id) redirect('/onboarding')
  if (profile.role !== 'doc' && profile.role !== 'coach') redirect('/dashboard')

  const { data: row, error } = await supabase.from('drills').select('*').eq('id', drillId).single()
  if (error || !row) notFound()
  const parsed = DrillRowSchema.safeParse(row)
  if (!parsed.success) throw new Error('Corrupt drill doc: ' + parsed.error.message)

  const { data: teams } = await supabase
    .from('teams').select('id, name').eq('club_id', profile.club_id).order('name')

  if (isReadonly) return <ReadonlyView drill={parsed.data} />
  return <EditorClient drill={parsed.data} teams={teams ?? []} role={profile.role} />
}
