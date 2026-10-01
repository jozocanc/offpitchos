import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Sidebar from '@/components/sidebar'
import { ToastProvider } from '@/components/toast'
import VoiceCommand from '@/components/voice-command'
import { VoiceFocusProvider } from '@/components/voice-context'
import { canSwitchRole, getEffectiveRole, getViewerIdentity } from '@/lib/admin-role'
import PlayerPreviewBanner from './player-preview-banner'
import OfflineBanner from '@/components/offline-banner'
import { ClubTimezoneProvider } from '@/components/club-timezone'
import { DEFAULT_TIMEZONE } from '@/lib/format-datetime'
import { getAuthClaims, getCurrentProfile } from '@/lib/current-profile'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Request-memoized (lib/current-profile): getClaims verifies the JWT
  // locally (asymmetric signing keys), no network round-trip, and the page
  // below shares this same claims check and profile query instead of issuing
  // its own. Middleware already validated + refreshed the session.
  const claims = await getAuthClaims()

  if (!claims) redirect('/login')

  // Check onboarding status. The club's timezone rides along on the same query
  // so every date below this layout formats against it rather than against the
  // runtime's zone (UTC on the server, local in the browser) — see migration 043.
  const profile = await getCurrentProfile()

  if (!profile || !profile.onboarding_complete) {
    redirect('/onboarding')
  }

  const supabase = await createClient()

  // "Preview as" — a DOC can view the app as one of their coaches or players.
  const actualRole = profile.role ?? 'player'
  const effectiveRole = await getEffectiveRole(actualRole)
  // "View as → Player" shows a real sample player's experience; the banner
  // says whose view this is so nobody mistakes it for their own account.
  // One-team programs (every college program) see "Roster" instead of "Teams"
  // in the nav. Head-only count: no rows come back. Both run together.
  const [viewer, teamCount] = await Promise.all([
    canSwitchRole(actualRole) && effectiveRole === 'player'
      ? getViewerIdentity()
      : Promise.resolve(null),
    profile.club_id
      ? supabase
          .from('teams')
          .select('id', { count: 'exact', head: true })
          .eq('club_id', profile.club_id)
          .then(({ count }) => count ?? 0)
      : Promise.resolve(0),
  ])

  // Falls back to the default for a profile detached from its club
  // (soft-deleted).
  const timezone = profile.timezone ?? DEFAULT_TIMEZONE

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
          {/* Phones: bottom padding clears the fixed 60px tab bar plus the
              iPhone home-indicator inset (mobile-tab-bar.tsx); top padding
              respects the status bar inset. min-w-0 stops wide children from
              stretching the flex row past the viewport. Desktop has the
              static sidebar, so no padding there. */}
          <OfflineBanner />
          <main className="flex-1 min-w-0 overflow-auto pt-[env(safe-area-inset-top)] pb-[calc(60px+env(safe-area-inset-bottom))] md:pt-0 md:pb-0">
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
