'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'

export type OnboardingState = {
  visible: boolean
  hasTeam: boolean
  hasCoach: boolean
  hasParent: boolean
  hasEvent: boolean
  allComplete: boolean
}

// Returns the live state of the 4-step post-wizard checklist for the
// caller's club. `visible` folds in the dismiss flag so the dashboard
// can mount-or-skip without a second round-trip.
export async function getOnboardingState(): Promise<OnboardingState> {
  const empty: OnboardingState = {
    visible: false,
    hasTeam: false,
    hasCoach: false,
    hasParent: false,
    hasEvent: false,
    allComplete: false,
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return empty

  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id, role')
    .eq('user_id', user.id)
    .single()

  if (!profile?.club_id || profile.role !== 'doc') return empty

  // Dismiss flag — null row is fine, treat missing as "not dismissed."
  const { data: settings } = await supabase
    .from('club_settings')
    .select('onboarding_dismissed_at')
    .eq('club_id', profile.club_id)
    .maybeSingle()

  if (settings?.onboarding_dismissed_at) return empty

  // team_members has no club_id — join through teams to scope.
  const { data: teamRows } = await supabase
    .from('teams')
    .select('id')
    .eq('club_id', profile.club_id)
  const teamIds = (teamRows ?? []).map(t => t.id)

  const hasTeam = teamIds.length > 0

  let hasCoach = false
  let hasParent = false
  if (hasTeam) {
    const { count: coachCount } = await supabase
      .from('team_members')
      .select('id', { count: 'exact', head: true })
      .in('team_id', teamIds)
      .eq('role', 'coach')
    hasCoach = (coachCount ?? 0) > 0

    const { count: parentCount } = await supabase
      .from('team_members')
      .select('id', { count: 'exact', head: true })
      .in('team_id', teamIds)
      .eq('role', 'parent')
    hasParent = (parentCount ?? 0) > 0
  }

  const { count: eventCount } = await supabase
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('club_id', profile.club_id)
  const hasEvent = (eventCount ?? 0) > 0

  const allComplete = hasTeam && hasCoach && hasParent && hasEvent

  return {
    visible: true,
    hasTeam,
    hasCoach,
    hasParent,
    hasEvent,
    allComplete,
  }
}

// Upsert — some clubs may not have a club_settings row yet since it's
// not auto-created at signup. Conflict on the UNIQUE club_id keeps this
// a single round-trip whether the row exists or not.
export async function dismissOnboarding(): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('club_id, role')
    .eq('user_id', user.id)
    .single()

  if (!profile?.club_id || profile.role !== 'doc') {
    return { ok: false, error: 'Only DOCs can dismiss the checklist' }
  }

  const state = await getOnboardingState()
  if (!state.allComplete) {
    return { ok: false, error: 'Finish all steps before dismissing' }
  }

  const { error } = await supabase
    .from('club_settings')
    .upsert(
      { club_id: profile.club_id, onboarding_dismissed_at: new Date().toISOString() },
      { onConflict: 'club_id' }
    )

  if (error) return { ok: false, error: error.message }

  revalidatePath('/dashboard')
  return { ok: true }
}

// Void-returning adapter for `<form action={...}>`. Swallowing errors
// here is intentional — the dismiss button is only rendered after all
// four checklist steps are satisfied, so the one remaining failure mode
// is a transient DB error where a retry is the right UX.
export async function dismissOnboardingForm(_formData: FormData): Promise<void> {
  await dismissOnboarding()
}
