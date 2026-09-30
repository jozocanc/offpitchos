import { getMyCheckinState } from './actions'
import CheckinForm from './checkin-form'

// Server wrapper for the dashboard's "Morning check-in" card. Renders nothing
// for accounts without a roster row. Preview-aware through getMyCheckinState.
export default async function CheckinCard() {
  let state
  try {
    state = await getMyCheckinState()
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
