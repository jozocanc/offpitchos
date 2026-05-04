'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { ROLES } from '@/lib/constants'

export async function completeOnboarding(formData: FormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const clubName = formData.get('clubName') as string
  const teamName = formData.get('teamName') as string
  const ageGroup = formData.get('ageGroup') as string

  if (!clubName?.trim() || !teamName?.trim() || !ageGroup) {
    throw new Error('All fields are required')
  }

  // 1. Create the club
  const { data: club, error: clubError } = await supabase
    .from('clubs')
    .insert({ name: clubName.trim(), created_by: user.id })
    .select('id')
    .single()

  if (clubError) throw new Error(`Failed to create club: ${clubError.message}`)

  // 2. Create the first team
  const { error: teamError } = await supabase
    .from('teams')
    .insert({ name: teamName.trim(), age_group: ageGroup, club_id: club.id })

  if (teamError) throw new Error(`Failed to create team: ${teamError.message}`)

  // 3. Upsert the profile.
  // `display_name` (set by email signup at signup/page.tsx:30) is the
  // canonical name field and must win the fallback, otherwise we
  // overwrite the typed name with the email local-part — the 2026-04-24
  // "Welcome back, jozo.cancar27+test12" bug.
  const displayName =
    (user.user_metadata?.display_name as string) ||
    (user.user_metadata?.full_name as string) ||
    (user.user_metadata?.name as string) ||
    user.email?.split('@')[0] ||
    'User'

  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({
      user_id: user.id,
      club_id: club.id,
      role: ROLES.DOC,
      onboarding_complete: true,
      display_name: displayName,
    }, { onConflict: 'user_id' })

  if (profileError) throw new Error(`Failed to update profile: ${profileError.message}`)

  return { ok: true as const }
}
