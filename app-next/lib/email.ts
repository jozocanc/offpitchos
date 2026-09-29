// Email sending via Resend.
//
// Contract:
// - 1:1 senders (sendCoachInviteEmail, sendNotificationEmail) THROW on any
//   Resend failure. Callers must try/catch and surface the failure — the
//   previous pattern of returning `{ error }` was silently swallowed by
//   callers that used `.catch()` on a promise that never rejected.
// - Bulk sender (sendEmailToProfiles) catches per recipient so one bad
//   mailbox never kills a whole announcement. Returns `{ sent, failed }`
//   so callers can surface partial delivery if they want.
// - Every failure is `console.error`'d with the Resend status code + name
//   + message + target address so Vercel log triage is a one-grep job.
// - Demo recipients (@example.test) short-circuit BEFORE Resend is called
//   so seed operations don't generate failed-delivery noise.

import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

// offpitchos.com is verified in Resend. The old fallback, onboarding@resend.dev,
// is Resend's sandbox sender: it only delivers to the account owner, so any
// environment missing RESEND_FROM_EMAIL silently dropped every player email.
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'OffPitchOS <notifications@offpitchos.com>'

// Any address on the demo TLD is a seeded fake account. Returning true
// here means "pretend the send succeeded, never touch Resend" — callers
// see a success, logs stay clean, Resend doesn't log a delivery failure
// for a throwaway mailbox.
export function isDemoRecipient(email: string): boolean {
  return email.trim().toLowerCase().endsWith('@example.test')
}

// Resend's SDK returns error objects shaped like { name, message, statusCode? }.
// Keep the extraction loose — Resend has shifted field names between versions
// and we'd rather get a slightly generic log than throw while throwing.
function describeResendError(error: unknown, to: string): string {
  if (!error || typeof error !== 'object') return `Resend: unknown error (to=${to})`
  const err = error as { name?: unknown; message?: unknown; statusCode?: unknown }
  const name = typeof err.name === 'string' ? err.name : 'UnknownError'
  const message = typeof err.message === 'string' ? err.message : String(err.message ?? 'no message')
  const statusCode = typeof err.statusCode === 'number' ? err.statusCode : undefined
  const statusPart = statusCode ? ` [${statusCode}]` : ''
  return `Resend${statusPart} ${name}: ${message} (to=${to})`
}

export async function sendCoachInviteEmail({
  to,
  clubName,
  joinUrl,
}: {
  to: string
  clubName: string
  joinUrl: string
}): Promise<void> {
  if (isDemoRecipient(to)) return
  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `You've been invited to join the coaching staff at ${clubName}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; font-weight: 900; letter-spacing: -0.5px; margin-bottom: 8px;">
          OffPitch<span style="color: #00FF87;">OS</span>
        </h1>
        <p style="color: #94A3B8; font-size: 14px; margin-bottom: 32px;">Team Operating System</p>

        <p style="font-size: 16px; color: #333; margin-bottom: 8px;">
          You've been invited to join the coaching staff at <strong>${clubName}</strong>.
        </p>
        <p style="font-size: 14px; color: #666; margin-bottom: 32px;">
          Click the button below to accept the invite and set up your account.
        </p>

        <a href="${joinUrl}" style="display: inline-block; background: #00FF87; color: #0A1628; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">
          Accept Invite
        </a>

        <p style="font-size: 12px; color: #94A3B8; margin-top: 32px;">
          Or copy this link: <a href="${joinUrl}" style="color: #00FF87;">${joinUrl}</a>
        </p>
        <p style="font-size: 12px; color: #94A3B8; margin-top: 16px;">
          This invite expires in 7 days. If you didn't expect this email, you can safely ignore it.
        </p>
      </div>
    `,
  })

  if (error) {
    const detail = describeResendError(error, to)
    console.error('[email] coach invite failed:', detail)
    throw new Error(detail)
  }
}

export async function sendRosterRecoveryEmail({
  to,
  clubName,
  recoveryUrl,
}: {
  to: string
  clubName: string
  recoveryUrl: string
}): Promise<void> {
  if (isDemoRecipient(to)) return
  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `${clubName} added you on OffPitchOS: set your password`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; font-weight: 900; letter-spacing: -0.5px; margin-bottom: 8px;">
          OffPitch<span style="color: #00FF87;">OS</span>
        </h1>
        <p style="color: #94A3B8; font-size: 14px; margin-bottom: 32px;">Team Operating System</p>

        <p style="font-size: 16px; color: #333; margin-bottom: 8px;">
          <strong>${clubName}</strong> just added you to OffPitchOS, the app your team runs on.
        </p>
        <p style="font-size: 14px; color: #666; margin-bottom: 32px;">
          Click below to set your password and log in. You'll see your schedule, get notified when training changes, and message your coaches directly.
        </p>

        <a href="${recoveryUrl}" style="display: inline-block; background: #00FF87; color: #0A1628; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-size: 14px; text-transform: uppercase; letter-spacing: 0.5px;">
          Set My Password
        </a>

        <p style="font-size: 12px; color: #94A3B8; margin-top: 32px;">
          Or copy this link: <a href="${recoveryUrl}" style="color: #00FF87;">${recoveryUrl}</a>
        </p>
        <p style="font-size: 12px; color: #94A3B8; margin-top: 16px;">
          If you weren't expecting this, you can safely ignore this email. Your account stays inactive until you set a password.
        </p>
      </div>
    `,
  })

  if (error) {
    const detail = describeResendError(error, to)
    console.error('[email] roster recovery failed:', detail)
    throw new Error(detail)
  }
}

// Coach-written text goes into the email as text, not markup, and keeps its
// line breaks.
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function notificationHtml(rawMessage: string, actionUrl?: string, actionLabel?: string, messageIsHtml = false): string {
  const message = messageIsHtml ? rawMessage : escapeHtml(rawMessage).replace(/\n/g, '<br>')
  return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; font-weight: 900; letter-spacing: -0.5px; margin-bottom: 8px;">
          OffPitch<span style="color: #00FF87;">OS</span>
        </h1>
        <p style="color: #94A3B8; font-size: 14px; margin-bottom: 32px;">Team Operating System</p>

        <p style="font-size: 16px; color: #333; margin-bottom: 24px;">
          ${message}
        </p>

        ${actionUrl ? `
          <a href="${actionUrl}" style="display: inline-block; background: #00FF87; color: #0A1628; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-size: 14px;">
            ${actionLabel ?? 'View in App'}
          </a>
        ` : ''}

        <p style="font-size: 12px; color: #94A3B8; margin-top: 32px;">
          You're receiving this because you're on a team that uses OffPitchOS.
        </p>
      </div>
    `
}

export async function sendNotificationEmail({
  to,
  subject,
  message,
  actionUrl,
  actionLabel,
}: {
  to: string
  subject: string
  message: string
  actionUrl?: string
  actionLabel?: string
}): Promise<void> {
  if (isDemoRecipient(to)) return
  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject,
    html: notificationHtml(message, actionUrl, actionLabel),
  })

  if (error) {
    const detail = describeResendError(error, to)
    console.error('[email] notification failed:', detail)
    throw new Error(detail)
  }
}

export interface BulkEmailResult {
  sent: number
  failed: Array<{ email: string; error: string }>
}

// Bulk fan-out. One failed recipient must never kill the whole batch —
// a partial delivery is strictly better than an all-or-nothing toast.
// Callers can inspect `failed.length` to surface partial state.
export async function sendEmailToProfiles(
  profileIds: string[],
  subject: string,
  message: string,
  actionUrl?: string,
  /** The digest passes pre-rendered HTML; everything else is plain text. */
  messageIsHtml = false,
): Promise<BulkEmailResult> {
  const result: BulkEmailResult = { sent: 0, failed: [] }

  const { createServiceClient } = await import('@/lib/supabase/service')
  const service = createServiceClient()

  const { data: profiles } = await service
    .from('profiles')
    .select('user_id')
    .in('id', profileIds)

  if (!profiles || profiles.length === 0) return result

  // Look addresses up in parallel. One by one, a 34-player team made the
  // coach wait several seconds after hitting Post.
  const emails = await Promise.all(
    profiles.map(async profile => {
      try {
        const { data: { user } } = await service.auth.admin.getUserById(profile.user_id)
        return user?.email ?? null
      } catch (err) {
        console.error('[email] getUserById failed:', err, 'profile:', profile.user_id)
        result.failed.push({ email: profile.user_id, error: 'lookup_failed' })
        return null
      }
    }),
  )

  const real: string[] = []
  for (const email of emails) {
    if (!email) continue
    // Seeded demo accounts count as delivered without touching Resend.
    if (isDemoRecipient(email)) result.sent++
    else real.push(email)
  }

  // Resend's batch endpoint takes up to 100 emails per request. Sending them
  // one request each tripped the per-second rate limit on a full squad, and
  // the players past the limit simply never got the message.
  const html = notificationHtml(message, actionUrl, undefined, messageIsHtml)
  for (let i = 0; i < real.length; i += 100) {
    const chunk = real.slice(i, i + 100)
    const { error } = await resend.batch.send(
      chunk.map(to => ({ from: FROM_EMAIL, to, subject, html })),
    )
    if (error) {
      console.error('[email] batch send failed:', describeResendError(error, `${chunk.length} recipients`))
      for (const to of chunk) result.failed.push({ email: to, error: describeResendError(error, to) })
    } else {
      result.sent += chunk.length
    }
  }

  return result
}
