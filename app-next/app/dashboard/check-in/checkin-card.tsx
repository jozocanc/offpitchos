import { getMyCheckinState, type MyCheckinState } from './actions'
import CheckinForm from './checkin-form'

// Server wrapper for the dashboard's "Morning check-in" card. Renders nothing
// for accounts without a roster row. Preview-aware through getMyCheckinState.
export default async function CheckinCard({
  statePromise,
}: {
  /** Started early by the dashboard so it overlaps the page's other queries. */
  statePromise?: Promise<MyCheckinState>
} = {}) {
  let state
  try {
    state = await (statePromise ?? getMyCheckinState())
  } catch (e) {
    console.error('[checkin-card] load failed:', e)
    return null
  }
  if (!state.player) return null

  return (
    <CheckinForm
      key={state.checkin?.updatedAt ?? 'new'}
      initial={state.checkin}
      firstName={state.player.firstName}
      isPreview={state.isPreview}
      variant="card"
    />
  )
}
