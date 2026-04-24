// Single source of truth for recipient-aware toast strings.
// Every caller that reports a "notified X people" message goes through
// this helper so:
//   - the empty-account case names the real problem (nobody to notify)
//     instead of silently claiming success, AND
//   - email-delivery failures (Resend bounces) surface to the DOC
//     instead of being swallowed behind the intended-recipient count.

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

// Total-failure copy: confirms the data action saved, names email as
// the broken part, and offers the best honest retry path we have for
// that action. Do NOT claim a retry button exists where it doesn't —
// for cancellations there is no clean retry, so the copy points at a
// direct-contact fallback instead.
const TOTAL_FAILURE_HINT: Record<ToastAction, string> = {
  event_created:
    "Event created, but emails didn't deliver. The event is saved — edit it in a few minutes to retry, or message the team directly.",
  event_updated:
    "Schedule updated, but emails didn't deliver. The update is saved — save the event again in a few minutes to retry.",
  event_cancelled:
    "Event cancelled, but emails didn't deliver. The cancellation is saved — message the team directly so they don't show up.",
  event_restored:
    "Event restored, but emails didn't deliver. The change is saved — save the event again in a few minutes to retry.",
  announcement_posted:
    "Posted, but emails didn't deliver. The announcement is saved — repost in a few minutes to retry, or message the team directly.",
  camp_created:
    "Camp created, but emails didn't deliver. The camp is saved — post an announcement to notify parents.",
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
// Three honesty branches:
//   - total recipients 0 → zero-hint ("invite parents first").
//   - emailFailed === 0  → "N notified" unchanged from pre-1.5 behavior.
//   - emailFailed > 0    → partial ("X of Y reached") or total-failure
//     copy depending on whether any email landed at all.
//
// Push delivery is a separate channel. A parent whose email failed may
// still have gotten a push notification, so the copy deliberately says
// "emails didn't deliver" rather than "parent wasn't notified."
export function formatRecipientToast(opts: {
  action: ToastAction
  parents: number
  coaches: number
  emailFailed?: number
}): string {
  const { action, parents, coaches, emailFailed = 0 } = opts
  const total = parents + coaches

  if (total === 0) return `${BASE_LABEL[action]}. ${ZERO_HINT[action]}`

  if (emailFailed === 0) {
    const recipients = describeRecipients(parents, coaches)
    return `${BASE_LABEL[action]} · ${recipients} notified`
  }

  if (emailFailed >= total) {
    return TOTAL_FAILURE_HINT[action]
  }

  const delivered = total - emailFailed
  const failedLabel = pluralize(emailFailed, 'email', 'emails')
  return `${BASE_LABEL[action]} · ${delivered} of ${total} reached (${failedLabel} failed)`
}
