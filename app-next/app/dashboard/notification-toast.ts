// Single source of truth for recipient-aware toast strings.
// Every caller that reports a "notified X people" message goes through
// this helper so the empty-account case always names the real problem
// (nobody to notify yet) instead of silently claiming success.

export type ToastAction =
  | 'event_created'
  | 'event_updated'
  | 'event_cancelled'
  | 'event_restored'
  | 'announcement_posted'
  | 'camp_created'

const BASE_LABEL: Record<ToastAction, string> = {
  event_created: 'Event created',
  event_updated: 'Schedule updated',
  event_cancelled: 'Event cancelled',
  event_restored: 'Event restored',
  announcement_posted: 'Posted',
  camp_created: 'Camp created',
}

// Empty-state hint points the user at the fix. The checklist on the
// dashboard also surfaces this, so the language stays consistent.
const ZERO_HINT: Record<ToastAction, string> = {
  event_created:       'No parents on this team yet — add them in Teams.',
  event_updated:       'No parents on this team yet — add them in Teams.',
  event_cancelled:     'No one on this team yet, so no notifications went out.',
  event_restored:      'No one on this team yet, so no notifications went out.',
  announcement_posted: 'No one on this audience yet — invite parents in Teams.',
  camp_created:        'No parents on this team yet — add them in Teams.',
}

function pluralize(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`
}

function joinParts(parts: string[]): string {
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0]
  return parts.join(' and ')
}

// Build "N parents and M coaches" from raw counts. Omits zero-count
// roles entirely so we don't produce "0 parents and 3 coaches."
export function describeRecipients(parents: number, coaches: number): string {
  const parts: string[] = []
  if (parents > 0) parts.push(pluralize(parents, 'parent', 'parents'))
  if (coaches > 0) parts.push(pluralize(coaches, 'coach', 'coaches'))
  return joinParts(parts)
}

// Returns the final user-facing toast string for a notify-style action.
// If the total recipient count is zero, the message names the gap and
// points at the fix instead of claiming a phantom notification.
export function formatRecipientToast(opts: {
  action: ToastAction
  parents: number
  coaches: number
}): string {
  const { action, parents, coaches } = opts
  const total = parents + coaches

  if (total === 0) return `${BASE_LABEL[action]}. ${ZERO_HINT[action]}`

  const recipients = describeRecipients(parents, coaches)
  return `${BASE_LABEL[action]} · ${recipients} notified`
}
