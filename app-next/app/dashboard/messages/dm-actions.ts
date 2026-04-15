'use server'

import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'
import { revalidatePath } from 'next/cache'
import { sendPushToProfiles } from '@/lib/push'

const MAX_CONTENT = 2000

export interface DMThread {
  otherUserId: string
  otherName: string
  otherRole: string
  lastMessage: string
  lastMessageAt: string
  lastFromMe: boolean
  unreadCount: number
}

export interface DMMessage {
  id: string
  senderId: string
  content: string
  createdAt: string
  readAt: string | null
  isMine: boolean
}

export interface DMableUser {
  userId: string
  name: string
  role: string
  teams: string[]
}

// ------------------------------------------------------------
// Permission: who can the current user DM?
// Rules: parent <-> coach if they share a team. DOC <-> anyone in club.
// ------------------------------------------------------------

async function getDMableUserIds(myUserId: string, myRole: string, myClubId: string): Promise<Set<string>> {
  const service = createServiceClient()
  const allowed = new Set<string>()

  if (myRole === 'doc') {
    // DOC can DM anyone in their club.
    const { data } = await service
      .from('profiles')
      .select('user_id')
      .eq('club_id', myClubId)
      .neq('user_id', myUserId)
    for (const p of data ?? []) allowed.add(p.user_id)
    return allowed
  }

  // Coach or parent: collect teams I'm on, then the complementary
  // role on each of those teams.
  const { data: myProfile } = await service
    .from('profiles')
    .select('id')
    .eq('user_id', myUserId)
    .single()
  if (!myProfile) return allowed

  const { data: myMemberships } = await service
    .from('team_members')
    .select('team_id, role')
    .eq('profile_id', myProfile.id)
  const myTeams = (myMemberships ?? []).map(m => m.team_id)
  if (myTeams.length === 0) return allowed

  const otherRole = myRole === 'coach' ? 'parent' : 'coach'
  const { data: peers } = await service
    .from('team_members')
    .select('profile_id, profiles!inner(user_id)')
    .in('team_id', myTeams)
    .eq('role', otherRole)
  for (const p of peers ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const uid = (p as any).profiles?.user_id
    if (uid && uid !== myUserId) allowed.add(uid)
  }

  // Always allow DMing the club's DOC too.
  const { data: docs } = await service
    .from('profiles')
    .select('user_id')
    .eq('club_id', myClubId)
    .eq('role', 'doc')
  for (const d of docs ?? []) if (d.user_id !== myUserId) allowed.add(d.user_id)

  return allowed
}

async function getMe() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, club_id, role, display_name')
    .eq('user_id', user.id)
    .single()
  if (!profile?.club_id) return null
  return { userId: user.id, ...profile }
}

// ------------------------------------------------------------
// Queries
// ------------------------------------------------------------

export async function getDMableUsers(): Promise<DMableUser[]> {
  const me = await getMe()
  if (!me) return []
  const ids = await getDMableUserIds(me.userId, me.role, me.club_id)
  if (ids.size === 0) return []

  const service = createServiceClient()
  const { data: profiles } = await service
    .from('profiles')
    .select('id, user_id, display_name, role')
    .in('user_id', Array.from(ids))

  // Team context for display.
  const profileIds = (profiles ?? []).map(p => p.id)
  const { data: memberships } = await service
    .from('team_members')
    .select('profile_id, teams(name)')
    .in('profile_id', profileIds)
  const teamsByProfile = new Map<string, string[]>()
  for (const m of memberships ?? []) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const t = Array.isArray((m as any).teams) ? (m as any).teams[0] : (m as any).teams
    if (!t?.name) continue
    const arr = teamsByProfile.get(m.profile_id) ?? []
    arr.push(t.name)
    teamsByProfile.set(m.profile_id, arr)
  }

  return (profiles ?? [])
    .map(p => ({
      userId: p.user_id,
      name: p.display_name ?? 'Unknown',
      role: p.role ?? '',
      teams: teamsByProfile.get(p.id) ?? [],
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

export async function getDMThreads(): Promise<DMThread[]> {
  const me = await getMe()
  if (!me) return []

  const supabase = await createClient()
  const { data: messages } = await supabase
    .from('direct_messages')
    .select('id, sender_id, recipient_id, content, read_at, created_at')
    .or(`sender_id.eq.${me.userId},recipient_id.eq.${me.userId}`)
    .order('created_at', { ascending: false })
  if (!messages || messages.length === 0) return []

  const byOther = new Map<string, typeof messages>()
  for (const m of messages) {
    const other = m.sender_id === me.userId ? m.recipient_id : m.sender_id
    const arr = byOther.get(other) ?? []
    arr.push(m)
    byOther.set(other, arr)
  }

  const service = createServiceClient()
  const { data: profs } = await service
    .from('profiles')
    .select('user_id, display_name, role')
    .in('user_id', Array.from(byOther.keys()))
  const profByUser = new Map<string, { name: string; role: string }>(
    (profs ?? []).map(p => [p.user_id, { name: p.display_name ?? 'Unknown', role: p.role ?? '' }])
  )

  const threads: DMThread[] = []
  for (const [other, msgs] of byOther.entries()) {
    const last = msgs[0]
    const unread = msgs.filter(m => m.recipient_id === me.userId && !m.read_at).length
    const prof = profByUser.get(other) ?? { name: 'Unknown', role: '' }
    threads.push({
      otherUserId: other,
      otherName: prof.name,
      otherRole: prof.role,
      lastMessage: last.content,
      lastMessageAt: last.created_at,
      lastFromMe: last.sender_id === me.userId,
      unreadCount: unread,
    })
  }

  threads.sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime())
  return threads
}

export async function getThreadMessages(otherUserId: string): Promise<DMMessage[]> {
  const me = await getMe()
  if (!me) return []
  const supabase = await createClient()
  const { data } = await supabase
    .from('direct_messages')
    .select('id, sender_id, content, created_at, read_at')
    .or(
      `and(sender_id.eq.${me.userId},recipient_id.eq.${otherUserId}),` +
      `and(sender_id.eq.${otherUserId},recipient_id.eq.${me.userId})`
    )
    .order('created_at', { ascending: true })
  return (data ?? []).map(m => ({
    id: m.id,
    senderId: m.sender_id,
    content: m.content,
    createdAt: m.created_at,
    readAt: m.read_at,
    isMine: m.sender_id === me.userId,
  }))
}

export async function getUnreadDMCount(): Promise<number> {
  const me = await getMe()
  if (!me) return 0
  const supabase = await createClient()
  const { count } = await supabase
    .from('direct_messages')
    .select('id', { count: 'exact', head: true })
    .eq('recipient_id', me.userId)
    .is('read_at', null)
  return count ?? 0
}

// ------------------------------------------------------------
// Mutations
// ------------------------------------------------------------

export async function sendDM(recipientUserId: string, content: string): Promise<{ error?: string }> {
  const me = await getMe()
  if (!me) return { error: 'Not signed in' }

  const trimmed = content.trim()
  if (!trimmed) return { error: 'Message is empty' }
  if (trimmed.length > MAX_CONTENT) return { error: `Message too long (max ${MAX_CONTENT})` }
  if (recipientUserId === me.userId) return { error: "Can't message yourself" }

  const allowed = await getDMableUserIds(me.userId, me.role, me.club_id)
  if (!allowed.has(recipientUserId)) return { error: 'You cannot message this user' }

  const supabase = await createClient()
  const { error } = await supabase
    .from('direct_messages')
    .insert({
      club_id: me.club_id,
      sender_id: me.userId,
      recipient_id: recipientUserId,
      content: trimmed,
    })
  if (error) return { error: error.message }

  // Push notification to recipient (look up their profile_id).
  const service = createServiceClient()
  const { data: recipProfile } = await service
    .from('profiles')
    .select('id')
    .eq('user_id', recipientUserId)
    .single()
  if (recipProfile) {
    await sendPushToProfiles([recipProfile.id], {
      title: `New message from ${me.display_name ?? 'a teammate'}`,
      message: trimmed.length > 120 ? trimmed.slice(0, 117) + '…' : trimmed,
      url: `/dashboard/messages?dm=${me.userId}`,
      tag: `dm-${me.userId}`,
    })
  }

  revalidatePath('/dashboard/messages')
  return {}
}

export async function markThreadRead(otherUserId: string): Promise<void> {
  const me = await getMe()
  if (!me) return
  const supabase = await createClient()
  await supabase
    .from('direct_messages')
    .update({ read_at: new Date().toISOString() })
    .eq('recipient_id', me.userId)
    .eq('sender_id', otherUserId)
    .is('read_at', null)
  revalidatePath('/dashboard/messages')
}

export async function unsendDM(messageId: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { error } = await supabase
    .from('direct_messages')
    .delete()
    .eq('id', messageId)
  if (error) return { error: error.message }
  revalidatePath('/dashboard/messages')
  return {}
}
