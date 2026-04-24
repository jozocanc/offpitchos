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

import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'OffPitchOS <onboarding@resend.dev>'

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
  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject: `You've been invited to coach at ${clubName}`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; font-weight: 900; letter-spacing: -0.5px; margin-bottom: 8px;">
          OffPitch<span style="color: #00FF87;">OS</span>
        </h1>
        <p style="color: #94A3B8; font-size: 14px; margin-bottom: 32px;">Club Operating System</p>

        <p style="font-size: 16px; color: #333; margin-bottom: 8px;">
          You've been invited to join <strong>${clubName}</strong> as a coach.
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
  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to,
    subject,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <h1 style="font-size: 24px; font-weight: 900; letter-spacing: -0.5px; margin-bottom: 8px;">
          OffPitch<span style="color: #00FF87;">OS</span>
        </h1>
        <p style="color: #94A3B8; font-size: 14px; margin-bottom: 32px;">Club Operating System</p>

        <p style="font-size: 16px; color: #333; margin-bottom: 24px;">
          ${message}
        </p>

        ${actionUrl ? `
          <a href="${actionUrl}" style="display: inline-block; background: #00FF87; color: #0A1628; font-weight: 700; text-decoration: none; padding: 14px 32px; border-radius: 12px; font-size: 14px;">
            ${actionLabel ?? 'View in App'}
          </a>
        ` : ''}

        <p style="font-size: 12px; color: #94A3B8; margin-top: 32px;">
          You're receiving this because you're a member of a club on OffPitchOS.
        </p>
      </div>
    `,
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
): Promise<BulkEmailResult> {
  const result: BulkEmailResult = { sent: 0, failed: [] }

  const { createServiceClient } = await import('@/lib/supabase/service')
  const service = createServiceClient()

  const { data: profiles } = await service
    .from('profiles')
    .select('user_id')
    .in('id', profileIds)

  if (!profiles || profiles.length === 0) return result

  for (const profile of profiles) {
    let email: string | undefined
    try {
      const { data: { user } } = await service.auth.admin.getUserById(profile.user_id)
      email = user?.email ?? undefined
    } catch (err) {
      console.error('[email] getUserById failed:', err, 'profile:', profile.user_id)
      result.failed.push({ email: profile.user_id, error: 'lookup_failed' })
      continue
    }

    if (!email) {
      // Profile exists but no auth email — not a delivery failure, just a gap.
      continue
    }

    try {
      await sendNotificationEmail({ to: email, subject, message, actionUrl })
      result.sent++
    } catch (err) {
      // sendNotificationEmail already logs with describeResendError — we
      // just record the per-recipient outcome here for the aggregate.
      result.failed.push({
        email,
        error: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return result
}
