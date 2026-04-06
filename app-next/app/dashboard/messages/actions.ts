'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { sendPushToProfiles } from '@/lib/push'
import { sendEmailToProfiles } from '@/lib/email'

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

export async function createAnnouncement(input: {
  teamId: string | null
  title: string
  body: string
}) {
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

  if (input.teamId) {
    const { data: members } = await service
      .from('team_members')
      .select('profile_id')
      .eq('team_id', input.teamId)

    recipientIds = (members ?? [])
      .map(m => m.profile_id)
      .filter(id => id !== profile.id)
  } else {
    const { data: members } = await service
      .from('profiles')
      .select('id')
      .eq('club_id', profile.club_id!)

    recipientIds = (members ?? [])
      .map(m => m.id)
      .filter(id => id !== profile.id)
  }

  if (recipientIds.length > 0) {
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

export async function getMessagesData() {
  const { profile, supabase } = await getUserProfile()

  const { data: announcements } = await supabase
    .from('announcements')
    .select(`
      id, team_id, title, body, pinned, created_at,
      author:profiles!announcements_author_id_fkey ( display_name ),
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

  return {
    announcements: announcements ?? [],
    teams: teams ?? [],
    userRole: profile.role,
    userProfileId: profile.id,
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
