import { Resend } from 'resend'

const resend = new Resend(process.env.RESEND_API_KEY)

const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? 'OffPitchOS <onboarding@resend.dev>'

export async function sendCoachInviteEmail({
  to,
  clubName,
  joinUrl,
}: {
  to: string
  clubName: string
  joinUrl: string
}) {
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
    console.error('Failed to send invite email:', error)
    return { error: error.message }
  }

  return { success: true }
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
}) {
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
    console.error('Failed to send notification email:', error)
  }
}

export async function sendEmailToProfiles(profileIds: string[], subject: string, message: string, actionUrl?: string) {
  const { createServiceClient } = await import('@/lib/supabase/service')
  const service = createServiceClient()

  const { data: profiles } = await service
    .from('profiles')
    .select('user_id')
    .in('id', profileIds)

  if (!profiles || profiles.length === 0) return

  // Use Supabase admin API to get user emails
  for (const profile of profiles) {
    try {
      const { data: { user } } = await service.auth.admin.getUserById(profile.user_id)
      if (user?.email) {
        await sendNotificationEmail({ to: user.email, subject, message, actionUrl })
      }
    } catch {
      // Skip if we can't get the email
    }
  }
}
