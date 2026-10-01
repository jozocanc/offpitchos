import { cache } from 'react'
import { getCurrentProfile } from '@/lib/current-profile'
import { createServiceClient } from '@/lib/supabase/service'
import { DEFAULT_TIMEZONE } from '@/lib/format-datetime'

/**
 * The signed-in user's club timezone, for server components and Server Actions.
 *
 * The client-side counterpart is useClubTimezone() from
 * components/club-timezone. Both exist so that neither side ever falls back to
 * the runtime's zone, which is what produced the UTC-until-hydration bug fixed
 * in migration 043.
 *
 * Wrapped in React's cache() so the extra query is deduped to once per request
 * no matter how many components or actions ask for it.
 *
 * Returns DEFAULT_TIMEZONE when there is no session or no club (a soft-deleted
 * profile has a null club_id), so callers never have to handle undefined.
 */
export const getClubTimezone = cache(async (): Promise<string> => {
  // Rides on the shared, request-memoized profile read (lib/current-profile),
  // which already embeds clubs(timezone), so asking for the zone costs no
  // query of its own once anything else has loaded the profile.
  const profile = await getCurrentProfile()
  return profile?.timezone ?? DEFAULT_TIMEZONE
})

/**
 * Club timezone by explicit club id, for paths with no session — public share
 * pages and invite links, where the club comes from a token rather than a
 * logged-in profile.
 *
 * Uses the service client deliberately. Those visitors are `anon`, and clubs
 * has no anon read policy, so the user-scoped client would return nothing and
 * silently fall back to the default — printing UTC-derived times on exactly
 * the pages shown to players who are not signed in yet. Reading one timezone
 * string for a club id the caller already holds exposes nothing: the id itself
 * came from a share token or invite token that already gates access, and the
 * value is a zone name, not member data.
 */
export const getClubTimezoneById = cache(async (clubId: string | null | undefined): Promise<string> => {
  if (!clubId) return DEFAULT_TIMEZONE

  const service = createServiceClient()
  const { data } = await service
    .from('clubs')
    .select('timezone')
    .eq('id', clubId)
    .single()

  return data?.timezone ?? DEFAULT_TIMEZONE
})
