'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { generateAndStoreDigest } from '@/lib/ai-digest'
import { sendEmailToProfiles } from '@/lib/email'

async function getDocProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, club_id, role')
    .eq('user_id', user.id)
    .single()

  if (!profile?.club_id) throw new Error('No club found')
  if (profile.role !== 'doc') throw new Error('Only DOC can generate digests')

  return { user, profile, supabase }
}

export async function generateDigestNow() {
  const { profile, user } = await getDocProfile()
  const result = await generateAndStoreDigest(profile.club_id!, user.id)
  revalidatePath('/dashboard/digest')
  revalidatePath('/dashboard')
  return { ok: true as const, weekStart: result.weekStart, id: result.id }
}

export async function emailDigest(digestId: string) {
  const { profile } = await getDocProfile()
  const service = createServiceClient()

  const { data: digest } = await service
    .from('weekly_digests')
    .select('id, club_id, week_start, summary_md')
    .eq('id', digestId)
    .eq('club_id', profile.club_id!)
    .single()

  if (!digest) throw new Error('Digest not found')

  // Email everyone in the club. Parents are the primary audience —
  // they'll forward it, share it, and it's free distribution.
  const { data: profiles } = await service
    .from('profiles')
    .select('id')
    .eq('club_id', profile.club_id!)

  const profileIds = (profiles ?? []).map(p => p.id)

  // Markdown -> very plain HTML. We don't pull in a markdown lib for
  // this — the prompt produces clean prose with simple bullets and
  // headings, so a paragraph-per-line render is fine and dependencies
  // stay flat (per CLAUDE.md).
  const html = renderDigestHtml(digest.summary_md)

  const subject = `Weekly Recap · week of ${new Date(digest.week_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`

  // Sending via the existing bulk helper — but with custom HTML, so we
  // call the per-recipient sender directly via service. Keep this
  // lightweight: one fan-out, fail-soft.
  const result = await sendEmailToProfiles(
    profileIds,
    subject,
    html,
    'https://offpitchos.com/dashboard/digest',
  )

  await service
    .from('weekly_digests')
    .update({
      emailed_at: new Date().toISOString(),
      email_recipients: result.sent,
    })
    .eq('id', digest.id)

  revalidatePath('/dashboard/digest')
  return { ok: true as const, sent: result.sent, failed: result.failed.length }
}

function renderDigestHtml(md: string): string {
  // Bare-bones markdown: # H1, ## H2, * list items, blank line breaks
  // paragraphs. The model output is already clean — anything unusual
  // just falls through as plain text.
  const lines = md.split('\n')
  const out: string[] = []
  let inList = false
  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      if (inList) { out.push('</ul>'); inList = false }
      out.push('')
      continue
    }
    if (line.startsWith('# ')) {
      if (inList) { out.push('</ul>'); inList = false }
      out.push(`<h2 style="font-size:20px;margin:16px 0 8px;">${escape(line.slice(2))}</h2>`)
      continue
    }
    if (line.startsWith('## ')) {
      if (inList) { out.push('</ul>'); inList = false }
      out.push(`<h3 style="font-size:16px;margin:14px 0 6px;color:#00FF87;">${escape(line.slice(3))}</h3>`)
      continue
    }
    if (line.startsWith('- ') || line.startsWith('* ')) {
      if (!inList) { out.push('<ul style="margin:8px 0;padding-left:20px;">'); inList = true }
      out.push(`<li style="margin:4px 0;">${escape(line.slice(2))}</li>`)
      continue
    }
    if (inList) { out.push('</ul>'); inList = false }
    out.push(`<p style="margin:8px 0;">${escape(line)}</p>`)
  }
  if (inList) out.push('</ul>')
  return out.join('')
}

function escape(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
