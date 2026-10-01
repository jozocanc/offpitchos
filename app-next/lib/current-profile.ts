import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'

/**
 * Request-memoized auth + profile lookups for server components.
 *
 * Every dashboard page used to open with its own `auth.getUser()` (a network
 * round-trip to the Supabase auth server) followed by its own `profiles`
 * query, and then getClubTimezone() and getViewerIdentity() each did the same
 * again. Wrapping both in React's cache() collapses all of that to one JWT
 * check and one profile query per request, however many components ask.
 *
 * getClaims() verifies the JWT locally against the project's asymmetric
 * signing keys, so it costs no network round-trip. The proxy has already
 * refreshed the session, and every query still runs under RLS with the same
 * token, so nothing here widens access.
 */

export interface CurrentProfile {
  id: string
  user_id: string
  club_id: string | null
  role: string | null
  display_name: string | null
  onboarding_complete: boolean | null
  /** The club's IANA timezone, or null when the profile has no club. */
  timezone: string | null
}

export const getAuthClaims = cache(async () => {
  const supabase = await createClient()
  const { data } = await supabase.auth.getClaims()
  return data?.claims ?? null
})

/** The signed-in user's auth id, or null when there is no session. */
export async function getAuthUserId(): Promise<string | null> {
  const claims = await getAuthClaims()
  return (claims?.sub as string | undefined) ?? null
}

export const getCurrentProfile = cache(async (): Promise<CurrentProfile | null> => {
  const userId = await getAuthUserId()
  if (!userId) return null

  const supabase = await createClient()
  const { data } = await supabase
    .from('profiles')
    .select('id, club_id, role, display_name, onboarding_complete, clubs(timezone)')
    .eq('user_id', userId)
    .single()

  if (!data) return null

  // Supabase returns a to-one embed as an object or a one-element array
  // depending on how it infers the relationship; normalize both.
  const club = Array.isArray(data.clubs) ? data.clubs[0] : data.clubs

  return {
    id: data.id as string,
    user_id: userId,
    club_id: (data.club_id as string | null) ?? null,
    role: (data.role as string | null) ?? null,
    display_name: (data.display_name as string | null) ?? null,
    onboarding_complete: (data.onboarding_complete as boolean | null) ?? null,
    timezone: (club as { timezone?: string } | null)?.timezone ?? null,
  }
})
