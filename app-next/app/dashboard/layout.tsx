import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/sidebar'
import { ToastProvider } from '@/components/toast'
import VoiceCommand from '@/components/voice-command'
import { VoiceFocusProvider } from '@/components/voice-context'
import { canSwitchRole, getEffectiveRole, getViewerIdentity } from '@/lib/admin-role'
import PlayerPreviewBanner from './player-preview-banner'
import { ClubTimezoneProvider } from '@/components/club-timezone'
import { DEFAULT_TIMEZONE } from '@/lib/format-datetime'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  // getClaims verifies the JWT locally (asymmetric signing keys) — no network
  // round-trip. Middleware already validated + refreshed the session.
  const { data: claimsData } = await supabase.auth.getClaims()
  const claims = claimsData?.claims

  if (!claims) redirect('/login')

  // Check onboarding status. The club's timezone rides along on the same query
  // so every date below this layout formats against it rather than against the
  // runtime's zone (UTC on the server, local in the browser) — see migration 043.
  const { data: profile } = await supabase
    .from('profiles')
    .select('onboarding_complete, role, club_id, clubs(timezone)')
    .eq('user_id', claims.sub)
    .single()

  if (!profile || !profile.onboarding_complete) {
    redirect('/onboarding')
  }

  // "Preview as" — a DOC can view the app as one of their coaches or players.
  const actualRole = profile.role ?? 'player'
  const effectiveRole = await getEffectiveRole(actualRole)
  // "View as → Player" shows a real sample player's experience; the banner
  // says whose view this is so nobody mistakes it for their own account.
  const viewer = canSwitchRole(actualRole) && effectiveRole === 'player'
    ? await getViewerIdentity()
    : null

  // Supabase returns a to-one embed as an object or a one-element array
  // depending on how it infers the relationship; normalize both. Falls back to
  // the default for a profile detached from its club (soft-deleted).
  const club = Array.isArray(profile.clubs) ? profile.clubs[0] : profile.clubs
  const timezone = (club as { timezone?: string } | null)?.timezone ?? DEFAULT_TIMEZONE

  // One-team programs (every college program) see "Roster" instead of "Teams"
  // in the nav. Head-only count: no rows come back.
  let teamCount = 0
  if (profile.club_id) {
    const { count } = await supabase
      .from('teams')
      .select('id', { count: 'exact', head: true })
      .eq('club_id', profile.club_id)
    teamCount = count ?? 0
  }

  return (
    <div className="flex min-h-screen bg-dark">
      <Sidebar
        userEmail={claims.email ?? ''}
        userRole={effectiveRole}
        canSwitchRole={canSwitchRole(actualRole)}
        singleTeam={teamCount === 1}
      />
      <ToastProvider>
        <ClubTimezoneProvider timezone={timezone}>
        <VoiceFocusProvider>
          {/* pt-14 on mobile clears the fixed hamburger button (top-4 + ~38px
              button = 54px footprint) so page headers don't render underneath
              it. md:pt-0 because the sidebar is static on desktop and the
              hamburger isn't rendered. */}
          <main className="flex-1 overflow-auto pt-14 md:pt-0">
            {viewer?.isPreview && <PlayerPreviewBanner player={viewer.previewPlayer} />}
            {children}
          </main>
          <VoiceCommand userRole={effectiveRole} />
        </VoiceFocusProvider>
        </ClubTimezoneProvider>
      </ToastProvider>
    </div>
  )
}
