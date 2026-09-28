import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

interface ClubContext {
  clubName: string
  teams: { name: string; ageGroup: string; coaches: string[]; playerCount: number }[]
  upcomingEvents: { title: string; type: string; team: string; date: string; time: string; endTime?: string; venue: string; address?: string | null; status: string }[]
  recentAnnouncements: { title: string; body: string; team: string | null; date: string }[]
  upcomingCamps?: { title: string; team: string; ageGroup: string; date: string; time: string; venue: string; fee: string; capacity: string | number }[]
  pendingCoverage?: { event: string; team: string; status: string }[]
  today?: string
  userRole?: string
  userName?: string
  /** The signed-in player's own roster row(s), so answers can be personalized. */
  myPlayers?: { name: string; team: string; jersey: number | null }[]
}

function formatContext(ctx: ClubContext): string {
  let text = `Program: ${ctx.clubName}\n`
  if (ctx.today) text += `Today: ${ctx.today}\n`
  if (ctx.userName) text += `User: ${ctx.userName} (${ctx.userRole})\n`
  if (ctx.myPlayers && ctx.myPlayers.length > 0) {
    text += `Their roster spot: ${ctx.myPlayers.map(k => `${k.name} — ${k.team}${k.jersey ? ` #${k.jersey}` : ''}`).join(', ')}\n`
  }
  text += '\n'

  text += `## Teams\n`
  for (const t of ctx.teams) {
    // Most college teams carry no age group; don't print an empty "()".
    text += `- ${t.name}${t.ageGroup ? ` (${t.ageGroup})` : ''}: ${t.playerCount} players, staff: ${t.coaches.join(', ') || 'none assigned'}\n`
  }

  text += `\n## Upcoming Schedule (next 14 days)\n`
  if (ctx.upcomingEvents.length === 0) {
    text += `No upcoming events.\n`
  }
  for (const e of ctx.upcomingEvents) {
    const timeRange = e.endTime ? `${e.time} – ${e.endTime}` : e.time
    const location = e.address ? `${e.venue} (${e.address})` : e.venue || 'TBD'
    text += `- ${e.date} ${timeRange} — ${e.title} (${e.type}, ${e.team}) at ${location}${e.status === 'cancelled' ? ' [CANCELLED]' : ''}\n`
  }

  if (ctx.upcomingCamps && ctx.upcomingCamps.length > 0) {
    text += `\n## Upcoming Camps\n`
    for (const c of ctx.upcomingCamps) {
      text += `- ${c.date} ${c.time} — ${c.title} (${c.team} ${c.ageGroup}) at ${c.venue}, fee: ${c.fee}, capacity: ${c.capacity}\n`
    }
  }

  if (ctx.pendingCoverage && ctx.pendingCoverage.length > 0) {
    text += `\n## Pending Coverage Requests\n`
    for (const cr of ctx.pendingCoverage) {
      text += `- ${cr.event} (${cr.team}) — ${cr.status}\n`
    }
  }

  text += `\n## Recent Announcements\n`
  if (ctx.recentAnnouncements.length === 0) {
    text += `No recent announcements.\n`
  }
  for (const a of ctx.recentAnnouncements) {
    text += `- ${a.date}: "${a.title}" ${a.team ? `(${a.team})` : '(program-wide)'} — ${a.body.slice(0, 200)}\n`
  }

  return text
}

const SYSTEM_PROMPT = `You are Pep, the OffPitchOS AI assistant for a college or club soccer team. You answer questions from the head coach, the coaching staff (assistant, goalkeeping and fitness coaches, video analysts) and the players, all of whom are adults, based on the team's real-time data provided below. There are no parents on the platform.

The data below is fetched LIVE from the database at the moment the user asks. It is always current and accurate. Trust it completely.

Rules:
- Only answer based on the data provided. If the data doesn't contain the answer, say so honestly.
- Be concise and friendly. Use plain language, not jargon.
- Format dates and times clearly (e.g. "Saturday Apr 19 at 5:00 PM").
- Always include the venue and address when answering about events.
- If a practice or game is cancelled, make that very clear.
- Never make up information. If you're unsure, say "I don't have that information. Check with your coaching staff."
- Keep answers short: 2-4 sentences max unless the question requires a list.
- Never use em-dashes in your answers; use commas, colons or periods.
- When a player asks, personalize the answer to THEIR own team. Don't list events for teams they're not on.
- "This week" means the 7 days starting from today's date shown above.
- "Today" means the date shown above. Use it to determine which events are next.
- When listing events, include the day of week, date, time range, venue, and team.`

export async function askClubQuestion(question: string, context: ClubContext): Promise<string> {
  const message = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 500,
    system: SYSTEM_PROMPT + '\n\n---\n\n' + formatContext(context),
    messages: [{ role: 'user', content: question }],
  })

  const block = message.content[0]
  if (block.type === 'text') return block.text
  return 'Sorry, I couldn\'t generate a response. Please try again.'
}
