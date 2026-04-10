'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { sendPushToProfiles } from '@/lib/push'
import { sendEmailToProfiles } from '@/lib/email'
import { getEffectiveRole } from '@/lib/admin-role'

async function getUserProfile() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, club_id, role')
    .eq('user_id', user.id)
    .single()

  if (!profile?.club_id) throw new Error('No club found')

  return { user, profile, supabase }
}

export interface CreateAnnouncementResult {
  announcementId: string
  parentCount: number
  coachCount: number
  totalRecipients: number
  audienceLabel: string
}

export async function createAnnouncement(input: {
  teamId: string | null
  title: string
  body: string
}): Promise<CreateAnnouncementResult> {
  const { profile, supabase } = await getUserProfile()

  if (!input.title.trim() || !input.body.trim()) {
    throw new Error('Title and body are required')
  }

  const { data: announcement, error } = await supabase
    .from('announcements')
    .insert({
      club_id: profile.club_id!,
      team_id: input.teamId,
      author_id: profile.id,
      title: input.title.trim(),
      body: input.body.trim(),
    })
    .select('id')
    .single()

  if (error) throw new Error(`Failed to create announcement: ${error.message}`)

  const service = createServiceClient()

  const { data: authorProfile } = await service
    .from('profiles')
    .select('display_name')
    .eq('id', profile.id)
    .single()

  const authorName = authorProfile?.display_name ?? 'Someone'
  const message = `${authorName} posted: ${input.title.trim()}`

  let recipientIds: string[] = []
  let audienceLabel = 'Club-wide'

  if (input.teamId) {
    const { data: members } = await service
      .from('team_members')
      .select('profile_id')
      .eq('team_id', input.teamId)

    recipientIds = (members ?? [])
      .map(m => m.profile_id)
      .filter(id => id !== profile.id)

    const { data: team } = await service
      .from('teams')
      .select('name')
      .eq('id', input.teamId)
      .single()
    audienceLabel = team?.name ?? 'Team'
  } else {
    const { data: members } = await service
      .from('profiles')
      .select('id')
      .eq('club_id', profile.club_id!)

    recipientIds = (members ?? [])
      .map(m => m.id)
      .filter(id => id !== profile.id)
  }

  // Count recipients by role for the delivery confirmation
  let parentCount = 0
  let coachCount = 0
  if (recipientIds.length > 0) {
    const { data: recipientProfiles } = await service
      .from('profiles')
      .select('role')
      .in('id', recipientIds)

    for (const p of recipientProfiles ?? []) {
      if (p.role === 'parent') parentCount++
      else if (p.role === 'coach' || p.role === 'doc') coachCount++
    }

    const notifications = recipientIds.map(pid => ({
      profile_id: pid,
      announcement_id: announcement.id,
      type: 'announcement_posted',
      message,
    }))

    await service.from('notifications').insert(notifications)
    await sendPushToProfiles(recipientIds, { title: 'OffPitchOS', message: `New: ${input.title}`, url: '/dashboard/messages', tag: 'announcement' })
    sendEmailToProfiles(recipientIds, `OffPitchOS — ${input.title}`, message, 'https://offpitchos.com/dashboard/messages')
  }

  revalidatePath('/dashboard/messages')

  return {
    announcementId: announcement.id,
    parentCount,
    coachCount,
    totalRecipients: recipientIds.length,
    audienceLabel,
  }
}

/**
 * Marks the current user's notification for an announcement as read.
 * Called when the user expands an announcement card so read receipts
 * are accurate on the author's view.
 */
export async function markAnnouncementRead(announcementId: string) {
  const { profile, supabase } = await getUserProfile()

  await supabase
    .from('notifications')
    .update({ read: true })
    .eq('profile_id', profile.id)
    .eq('announcement_id', announcementId)
    .eq('read', false)

  // Intentionally no revalidatePath — read state is a client-side concern,
  // no need to refetch the whole page on every open.
}

export async function createReply(announcementId: string, body: string) {
  const { profile, supabase } = await getUserProfile()

  if (!body.trim()) throw new Error('Reply cannot be empty')

  const { error } = await supabase
    .from('announcement_replies')
    .insert({
      announcement_id: announcementId,
      author_id: profile.id,
      body: body.trim(),
    })

  if (error) throw new Error(`Failed to post reply: ${error.message}`)

  const service = createServiceClient()

  const { data: announcement } = await service
    .from('announcements')
    .select('author_id, title')
    .eq('id', announcementId)
    .single()

  if (announcement && announcement.author_id !== profile.id) {
    const { data: replier } = await service
      .from('profiles')
      .select('display_name')
      .eq('id', profile.id)
      .single()

    await service.from('notifications').insert({
      profile_id: announcement.author_id,
      announcement_id: announcementId,
      type: 'announcement_reply',
      message: `${replier?.display_name ?? 'Someone'} replied to: ${announcement.title}`,
    })
    await sendPushToProfiles([announcement.author_id], { title: 'OffPitchOS', message: `Reply on: ${announcement.title}`, url: '/dashboard/messages', tag: 'announcement_reply' })
    sendEmailToProfiles([announcement.author_id], `OffPitchOS — Reply on: ${announcement.title}`, `${replier?.display_name ?? 'Someone'} replied to: ${announcement.title}`, 'https://offpitchos.com/dashboard/messages')
  }

  revalidatePath('/dashboard/messages')
}

export async function togglePin(announcementId: string) {
  const { supabase } = await getUserProfile()

  const { data: current } = await supabase
    .from('announcements')
    .select('pinned')
    .eq('id', announcementId)
    .single()

  if (!current) throw new Error('Announcement not found')

  const { error } = await supabase
    .from('announcements')
    .update({ pinned: !current.pinned })
    .eq('id', announcementId)

  if (error) throw new Error(`Failed to toggle pin: ${error.message}`)

  revalidatePath('/dashboard/messages')
}

export async function deleteAnnouncement(announcementId: string) {
  const { supabase } = await getUserProfile()

  const { error } = await supabase
    .from('announcements')
    .delete()
    .eq('id', announcementId)

  if (error) throw new Error(`Failed to delete announcement: ${error.message}`)

  revalidatePath('/dashboard/messages')
}

export async function deleteReply(replyId: string) {
  const { supabase } = await getUserProfile()

  const { error } = await supabase
    .from('announcement_replies')
    .delete()
    .eq('id', replyId)

  if (error) throw new Error(`Failed to delete reply: ${error.message}`)

  revalidatePath('/dashboard/messages')
}

export interface AudienceCounts {
  parents: number
  coaches: number
}

export async function getMessagesData() {
  const { user, profile, supabase } = await getUserProfile()
  const service = createServiceClient()

  const { data: announcements } = await supabase
    .from('announcements')
    .select(`
      id, team_id, title, body, pinned, created_at, author_id,
      author:profiles!announcements_author_id_fkey ( id, display_name ),
      teams ( name, age_group ),
      announcement_replies ( id )
    `)
    .eq('club_id', profile.club_id!)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })

  const { data: teams } = await supabase
    .from('teams')
    .select('id, name, age_group')
    .eq('club_id', profile.club_id!)
    .order('age_group')

  // Read receipts: for each announcement, count total notifications and how
  // many are read. Uses service client so the author sees every recipient's
  // status regardless of RLS scope.
  const announcementIds = (announcements ?? []).map(a => a.id)
  const readStatsByAnnouncement = new Map<string, { total: number; read: number }>()
  if (announcementIds.length > 0) {
    const { data: notifRows } = await service
      .from('notifications')
      .select('announcement_id, read')
      .eq('type', 'announcement_posted')
      .in('announcement_id', announcementIds)

    for (const row of notifRows ?? []) {
      if (!row.announcement_id) continue
      const entry = readStatsByAnnouncement.get(row.announcement_id) ?? { total: 0, read: 0 }
      entry.total += 1
      if (row.read) entry.read += 1
      readStatsByAnnouncement.set(row.announcement_id, entry)
    }
  }

  // Whether the *current user* has read each announcement — drives the
  // real unread dot shown to recipients.
  const ownReadByAnnouncement = new Map<string, boolean>()
  if (announcementIds.length > 0) {
    const { data: myNotifs } = await supabase
      .from('notifications')
      .select('announcement_id, read')
      .eq('profile_id', profile.id)
      .eq('type', 'announcement_posted')
      .in('announcement_id', announcementIds)

    for (const row of myNotifs ?? []) {
      if (!row.announcement_id) continue
      ownReadByAnnouncement.set(row.announcement_id, !!row.read)
    }
  }

  const announcementsWithStats = (announcements ?? []).map(a => {
    const stats = readStatsByAnnouncement.get(a.id) ?? { total: 0, read: 0 }
    // If the user isn't the author and has no notification row, treat it as
    // already-read (e.g. coach sees their own team's posts by another coach).
    const ownRead = ownReadByAnnouncement.has(a.id) ? !!ownReadByAnnouncement.get(a.id) : true
    return {
      ...a,
      read_count: stats.read,
      total_recipients: stats.total,
      own_read: ownRead,
    }
  })

  // Audience counts per team + club-wide, used by the compose modal to
  // preview who will receive a new announcement.
  const audienceByTeam: Record<string, AudienceCounts> = {}
  let clubWide: AudienceCounts = { parents: 0, coaches: 0 }

  const teamIds = (teams ?? []).map(t => t.id)
  if (teamIds.length > 0) {
    const { data: memberships } = await service
      .from('team_members')
      .select('team_id, role')
      .in('team_id', teamIds)

    for (const m of memberships ?? []) {
      if (!audienceByTeam[m.team_id]) audienceByTeam[m.team_id] = { parents: 0, coaches: 0 }
      if (m.role === 'parent') audienceByTeam[m.team_id].parents += 1
      else if (m.role === 'coach') audienceByTeam[m.team_id].coaches += 1
    }
  }

  const { data: clubProfiles } = await service
    .from('profiles')
    .select('role')
    .eq('club_id', profile.club_id)
    .neq('id', profile.id)

  for (const p of clubProfiles ?? []) {
    if (p.role === 'parent') clubWide.parents += 1
    else if (p.role === 'coach' || p.role === 'doc') clubWide.coaches += 1
  }

  return {
    announcements: announcementsWithStats,
    teams: teams ?? [],
    userRole: await getEffectiveRole(user.email ?? '', profile.role),
    userProfileId: profile.id,
    audienceByTeam,
    clubWideAudience: clubWide,
  }
}

export async function getAnnouncementReplies(announcementId: string) {
  const { supabase } = await getUserProfile()

  const { data } = await supabase
    .from('announcement_replies')
    .select(`
      id, body, created_at,
      author:profiles!announcement_replies_author_id_fkey ( id, display_name )
    `)
    .eq('announcement_id', announcementId)
    .order('created_at', { ascending: true })

  return data ?? []
}
