import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'

const cream = '#FAF7F2'
const card = '#FFFFFF'
const ink = '#0F1510'
const subtext = '#5C6660'
const forest = '#1F4E3D'
const border = '#E8E3DC'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')

  return (
    <main
      style={{ backgroundColor: cream, color: ink }}
      className="min-h-screen antialiased"
    >
      {/* Nav */}
      <nav
        style={{ backgroundColor: `${cream}cc`, borderColor: border }}
        className="sticky top-0 z-40 backdrop-blur border-b"
      >
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <span className="font-semibold text-lg tracking-tight" style={{ color: ink }}>
            OffPitch<span style={{ color: forest }}>OS</span>
          </span>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              style={{ color: subtext }}
              className="text-sm hover:text-black transition-colors px-3 py-2"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              style={{ backgroundColor: forest, color: cream }}
              className="font-semibold text-sm px-4 py-2 rounded-full hover:opacity-90 transition-opacity"
            >
              Get started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-24 pb-28 text-center">
        <span
          style={{ color: forest, backgroundColor: '#E8F1EB', borderColor: `${forest}20` }}
          className="inline-block text-[11px] font-semibold uppercase tracking-[0.16em] border rounded-full px-3 py-1.5 mb-8"
        >
          Built by directors, for directors
        </span>
        <h1
          style={{ color: ink }}
          className="text-5xl md:text-7xl font-semibold tracking-[-0.035em] leading-[1.03] mb-7"
        >
          The calm club
          <br />
          operating system.
        </h1>
        <p
          style={{ color: subtext }}
          className="text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed"
        >
          Coaches drop out, venues change, parents have questions. OffPitchOS reacts automatically — so your director of coaching can lead, not firefight.
        </p>
        <div className="flex items-center justify-center gap-3 flex-wrap">
          <a
            href="https://calendly.com/jozo-cancar27/offpitchos-demo"
            target="_blank"
            rel="noopener noreferrer"
            style={{ backgroundColor: forest, color: cream }}
            className="font-semibold px-6 py-3.5 rounded-full hover:opacity-90 transition-opacity text-base"
          >
            Book a demo →
          </a>
          <Link
            href="/signup"
            style={{ borderColor: border, color: ink }}
            className="border font-semibold px-6 py-3.5 rounded-full hover:bg-[#FFFFFF] transition-colors text-base"
          >
            Start free
          </Link>
        </div>
        <p style={{ color: subtext }} className="text-xs mt-8">
          15-min call · See it run your club · Replaces SportsEngine, TeamSnap, GroupMe &amp; spreadsheets
        </p>
      </section>

      {/* Product mockups */}
      <section className="max-w-6xl mx-auto px-6 pt-8 pb-24 space-y-24">
        {/* Mockup 1: voice command — text left, mockup right */}
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <span style={{ color: forest }} className="text-[11px] font-semibold uppercase tracking-[0.16em]">
              Voice-driven scheduling
            </span>
            <h3 style={{ color: ink }} className="text-3xl md:text-4xl font-semibold tracking-[-0.02em] mt-3 mb-5 leading-[1.1]">
              Say it. Done.
            </h3>
            <p style={{ color: subtext }} className="text-base leading-relaxed">
              Cancel a practice from your car. Every parent gets notified, the coach sees the change, the schedule updates. No forms, no group texts, no apologies.
            </p>
          </div>
          <VoiceMockup />
        </div>

        {/* Mockup 2: attention panel — mockup left, text right */}
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div className="md:order-2">
            <span style={{ color: forest }} className="text-[11px] font-semibold uppercase tracking-[0.16em]">
              Morning triage
            </span>
            <h3 style={{ color: ink }} className="text-3xl md:text-4xl font-semibold tracking-[-0.02em] mt-3 mb-5 leading-[1.1]">
              What needs you, ranked.
            </h3>
            <p style={{ color: subtext }} className="text-base leading-relaxed">
              Open the dashboard, see the day in one glance. The attention panel surfaces what&rsquo;s urgent, what&rsquo;s today, what&rsquo;s this week — so you stop firefighting and start leading.
            </p>
          </div>
          <div className="md:order-1">
            <AttentionMockup />
          </div>
        </div>

        {/* Mockup 3: event card — text left, mockup right */}
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <span style={{ color: forest }} className="text-[11px] font-semibold uppercase tracking-[0.16em]">
              For parents
            </span>
            <h3 style={{ color: ink }} className="text-3xl md:text-4xl font-semibold tracking-[-0.02em] mt-3 mb-5 leading-[1.1]">
              Every event in their pocket.
            </h3>
            <p style={{ color: subtext }} className="text-base leading-relaxed">
              Practice times, venue maps, RSVP — all in one place, all on their phone. No more &ldquo;what time Saturday?&rdquo; texts at 9 PM.
            </p>
          </div>
          <EventMockup />
        </div>
      </section>

      {/* Problem */}
      <section style={{ backgroundColor: card, borderColor: border }} className="border-y">
        <div className="max-w-5xl mx-auto px-6 py-24">
          <h2 style={{ color: ink }} className="text-3xl md:text-4xl font-semibold text-center tracking-[-0.02em] mb-3">
            Running a club is chaos.
          </h2>
          <p style={{ color: subtext }} className="text-center max-w-2xl mx-auto mb-14">
            The DOC logs into six apps just to answer one question. We fixed that.
          </p>
          <div className="grid md:grid-cols-2 gap-3 max-w-3xl mx-auto">
            {[
              'Coach cancels 30 min before practice — who covers?',
              'Parent asks "what time Saturday?" for the 50th time',
              'Tournament gear order stuck in a spreadsheet',
              'Camp payments missing and registrations unclear',
              'Announcements buried in group texts',
              '"Where\'s the venue?" — asked by every new parent',
            ].map((pain, i) => (
              <div
                key={i}
                style={{ backgroundColor: cream, borderColor: border }}
                className="rounded-2xl p-4 border flex items-start gap-3"
              >
                <span style={{ color: forest }} className="text-sm leading-none mt-1">—</span>
                <p style={{ color: ink }} className="text-sm">{pain}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 py-28">
        <h2 style={{ color: ink }} className="text-3xl md:text-4xl font-semibold text-center tracking-[-0.02em] mb-3">
          OffPitchOS handles it.
        </h2>
        <p style={{ color: subtext }} className="text-center max-w-2xl mx-auto mb-16">
          Every feature is judged by one question: does this help the DOC handle sudden changes without manual work?
        </p>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
          <FeatureCard
            title="Voice-driven scheduling"
            body='Say "Cancel U14 practice tonight" — the event moves, every parent gets notified, the coach sees the update. No forms.'
          />
          <FeatureCard
            title="AI-ranked coverage"
            body="Coach taps Can't Attend → OffPitchOS ranks available coaches by workload + team fit, messages the top match, logs the reason."
          />
          <FeatureCard
            title="Prioritized morning triage"
            body="When the DOC logs in, the attention panel shows what matters — unpaid camps, unlinked players, pending requests — ranked by urgency."
          />
          <FeatureCard
            title="Ask Ref"
            body="Parents ask questions in plain English: &ldquo;When is my son's next game?&rdquo; — the assistant pulls live schedule data and answers."
          />
          <FeatureCard
            title="Gear & camps without the spreadsheets"
            body="Request sizes with one tap. Run camps with Stripe checkout, shareable registration links, payment reminders — built in."
          />
          <FeatureCard
            title="Direct messaging, masked"
            body="Parents message coaches inside the app — no personal phone numbers exchanged. Safer, cleaner, compliant."
          />
        </div>
      </section>

      {/* Roles */}
      <section style={{ backgroundColor: card, borderColor: border }} className="border-y">
        <div className="max-w-6xl mx-auto px-6 py-28">
          <h2 style={{ color: ink }} className="text-3xl md:text-4xl font-semibold text-center tracking-[-0.02em] mb-16">
            One platform. Three perfect workflows.
          </h2>
          <div className="grid md:grid-cols-3 gap-5">
            <RoleCard
              label="For the Director"
              title="Your command center"
              points={[
                'Attention panel ranked by urgency',
                'Voice commands for any schedule change',
                'Real-time audience reach on announcements',
                'Full club analytics: attendance, coverage, payments',
              ]}
            />
            <RoleCard
              label="For the Coach"
              title="Focus on coaching"
              points={[
                'Coverage inbox — accept or decline with one tap',
                'Attendance + per-player feedback in the same flow',
                'Push alerts the moment anything changes',
                'Mobile-first — works on the sideline',
              ]}
            />
            <RoleCard
              label="For the Parent"
              title="Everything you need"
              points={[
                'Every practice and game with directions',
                'DM your kid\'s coach without sharing phones',
                'Camp registration and payment in two taps',
                'Push notifications for real-time changes',
              ]}
            />
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="max-w-6xl mx-auto px-6 py-28">
        <div className="grid md:grid-cols-2 gap-16 items-center">
          <div>
            <span style={{ color: forest }} className="text-[11px] font-semibold uppercase tracking-[0.16em]">
              Privacy by default
            </span>
            <h2 style={{ color: ink }} className="text-3xl md:text-4xl font-semibold tracking-[-0.02em] mt-3 mb-6">
              Your club data is <span style={{ color: forest }}>yours.</span>
            </h2>
            <p style={{ color: subtext }} className="leading-relaxed mb-6">
              We don&rsquo;t sell it. We don&rsquo;t share it. We don&rsquo;t train AI models on it. Kids&rsquo; data is handled with COPPA-friendly defaults, encrypted at rest, and deletable in 30 days on request.
            </p>
            <div className="flex gap-5 text-sm">
              <Link href="/privacy" style={{ color: forest }} className="font-semibold hover:underline">Privacy policy →</Link>
              <Link href="/terms" style={{ color: forest }} className="font-semibold hover:underline">Terms →</Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            {['US data centers', 'Encrypted at rest', 'GDPR / CCPA ready', 'COPPA-friendly', 'No ad tracking', 'Zero data resale'].map(label => (
              <div
                key={label}
                style={{ backgroundColor: card, borderColor: border }}
                className="rounded-2xl p-4 border text-center"
              >
                <p style={{ color: ink }} className="text-sm font-semibold">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Founder */}
      <section style={{ backgroundColor: card, borderColor: border }} className="border-y">
        <div className="max-w-5xl mx-auto px-6 py-24">
          <div className="grid md:grid-cols-[auto_1fr] gap-12 md:gap-16 items-center">
            {/* Stacked tilted photos */}
            <div className="relative w-[320px] h-[380px] md:w-[360px] md:h-[420px] mx-auto md:mx-0 shrink-0 group">
              {/* Back card — soccer (tilted left) */}
              <div
                style={{ borderColor: border, backgroundColor: '#FFFFFF' }}
                className="absolute top-0 left-0 rounded-2xl overflow-hidden border-4 shadow-[0_16px_40px_-16px_rgba(15,21,16,0.35)] -rotate-[8deg] transition-transform duration-500 ease-out group-hover:-rotate-[10deg] group-hover:-translate-x-1 group-hover:scale-[1.03]"
              >
                <Image
                  src="/jozo-soccer.jpg"
                  alt="Jozo Cancar playing D1 soccer at Florida Atlantic"
                  width={210}
                  height={280}
                  className="block w-[180px] h-[240px] md:w-[210px] md:h-[280px] object-cover"
                />
              </div>
              {/* Front card — suit (tilted right, on top) */}
              <div
                style={{ borderColor: border, backgroundColor: '#FFFFFF' }}
                className="absolute bottom-0 right-0 rounded-2xl overflow-hidden border-4 shadow-[0_24px_60px_-20px_rgba(15,21,16,0.45)] rotate-[6deg] transition-transform duration-500 ease-out group-hover:rotate-[8deg] group-hover:translate-x-1 group-hover:scale-[1.04]"
              >
                <Image
                  src="/jozo.jpg"
                  alt="Jozo Cancar, founder of OffPitchOS"
                  width={210}
                  height={280}
                  priority
                  className="block w-[180px] h-[240px] md:w-[210px] md:h-[280px] object-cover"
                />
              </div>
            </div>

            <div className="text-center md:text-left">
              <span style={{ color: forest }} className="text-[11px] font-semibold uppercase tracking-[0.16em]">
                Built by the person who needed it
              </span>
              <h2 style={{ color: ink }} className="text-3xl md:text-4xl font-semibold tracking-[-0.02em] mt-3 mb-5 leading-[1.1]">
                Hi, I&rsquo;m Jozo.
              </h2>
              <p style={{ color: subtext }} className="text-base md:text-lg leading-relaxed">
                Former D1 soccer player at Florida Atlantic. Years inside real clubs &mdash; as a player, on staff, around directors &mdash; showed me exactly where today&rsquo;s tools break down: coaches dropping out last minute, parents lost in group texts, directors logging into six apps to answer one question. OffPitchOS is what those systems should have been from the start.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ backgroundColor: forest }}>
        <div className="max-w-3xl mx-auto px-6 py-28 text-center">
          <h2 style={{ color: cream }} className="text-4xl md:text-5xl font-semibold tracking-[-0.025em] mb-6">
            Ready to stop firefighting?
          </h2>
          <p style={{ color: '#C8D7D0' }} className="text-lg mb-10">
            Set up your club in under five minutes. Free while we grow with you.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <Link
              href="/signup"
              style={{ backgroundColor: cream, color: forest }}
              className="font-semibold px-8 py-4 rounded-full hover:opacity-95 transition-opacity text-base"
            >
              Start free →
            </Link>
            <a
              href="https://calendly.com/jozo-cancar27/offpitchos-demo"
            target="_blank"
            rel="noopener noreferrer"
              style={{ color: cream, borderColor: `${cream}40` }}
              className="border font-semibold px-8 py-4 rounded-full hover:bg-[rgba(250,247,242,0.12)] transition-colors text-base"
            >
              Book a demo
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ backgroundColor: cream, borderColor: border }} className="border-t">
        <div className="max-w-6xl mx-auto px-6 py-12 flex flex-wrap items-center justify-between gap-4 text-sm">
          <div style={{ color: subtext }}>
            <span className="font-semibold" style={{ color: ink }}>
              OffPitch<span style={{ color: forest }}>OS</span>
            </span>
            <span className="ml-3">© {new Date().getFullYear()}</span>
          </div>
          <div className="flex gap-6" style={{ color: subtext }}>
            <Link href="/privacy" className="hover:text-black">Privacy</Link>
            <Link href="/terms" className="hover:text-black">Terms</Link>
            <a href="mailto:hello@offpitchos.com" className="hover:text-black">Contact</a>
            <Link href="/login" className="hover:text-black">Sign in</Link>
          </div>
        </div>
      </footer>
    </main>
  )
}

function FeatureCard({ title, body }: { title: string; body: string }) {
  return (
    <div
      style={{ backgroundColor: card, borderColor: border }}
      className="rounded-3xl p-7 border hover:shadow-[0_8px_24px_rgba(15,21,16,0.06)] transition-shadow"
    >
      <h3 style={{ color: ink }} className="font-semibold text-lg tracking-[-0.01em] mb-2">{title}</h3>
      <p style={{ color: subtext }} className="text-[15px] leading-relaxed">{body}</p>
    </div>
  )
}

function RoleCard({ label, title, points }: { label: string; title: string; points: string[] }) {
  return (
    <div
      style={{ backgroundColor: cream, borderColor: border }}
      className="rounded-3xl p-7 border"
    >
      <span style={{ color: forest }} className="text-[11px] font-semibold uppercase tracking-[0.14em]">{label}</span>
      <h3 style={{ color: ink }} className="font-semibold text-xl tracking-[-0.015em] mt-2 mb-5">{title}</h3>
      <ul className="space-y-3">
        {points.map((p, i) => (
          <li key={i} className="flex items-start gap-2.5 text-[15px]" style={{ color: ink }}>
            <span style={{ color: forest }} className="mt-0.5 text-sm">✓</span>
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ---- Stylized product mockups (CSS, not screenshots) ----

const mockSurface = '#0F1510'
const mockSurfaceLift = '#1A211C'
const mockText = '#FAF7F2'
const mockMuted = '#8C9690'
const mockGreen = '#34D399'
const mockGreenSoft = 'rgba(52, 211, 153, 0.16)'
const mockBorder = 'rgba(255, 255, 255, 0.08)'
const mockRed = '#F87171'
const mockRedSoft = 'rgba(248, 113, 113, 0.16)'
const mockAmber = '#FBBF24'
const mockAmberSoft = 'rgba(251, 191, 36, 0.14)'

function MockShell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{ backgroundColor: mockSurface, borderColor: mockBorder }}
      className="relative rounded-3xl border p-5 md:p-6 shadow-[0_24px_60px_-30px_rgba(15,21,16,0.45)]"
    >
      {children}
    </div>
  )
}

function VoiceMockup() {
  return (
    <MockShell>
      {/* Mic prompt */}
      <div className="flex items-center gap-3 mb-5">
        <div
          style={{ backgroundColor: mockGreenSoft, color: mockGreen }}
          className="w-10 h-10 rounded-full flex items-center justify-center"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
            <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
            <line x1="12" y1="19" x2="12" y2="23" />
            <line x1="8" y1="23" x2="16" y2="23" />
          </svg>
        </div>
        <div>
          <p style={{ color: mockMuted }} className="text-[10px] uppercase tracking-[0.18em] font-semibold mb-0.5">
            Listening
          </p>
          <p style={{ color: mockText }} className="text-sm font-medium">
            &ldquo;Cancel U14 practice tonight&rdquo;
          </p>
        </div>
      </div>

      {/* Event card morphing */}
      <div
        style={{ backgroundColor: mockSurfaceLift, borderColor: mockBorder }}
        className="rounded-2xl border p-4 mb-4"
      >
        <div className="flex items-center gap-2 mb-2">
          <span
            style={{ backgroundColor: mockRedSoft, color: mockRed }}
            className="text-[10px] font-bold uppercase tracking-wider rounded-full px-2 py-0.5"
          >
            Cancelled
          </span>
          <p style={{ color: mockMuted }} className="text-xs">U14 Tigers</p>
        </div>
        <p style={{ color: mockText }} className="text-base font-semibold line-through opacity-60">
          Practice · 6:00 – 7:30 PM
        </p>
        <p style={{ color: mockMuted }} className="text-xs mt-1">Bayshore Park · Field 3</p>
      </div>

      {/* Toast */}
      <div
        style={{ backgroundColor: mockGreenSoft, borderColor: 'rgba(52,211,153,0.3)' }}
        className="rounded-xl border px-3 py-2.5 flex items-center gap-2"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={mockGreen} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        <p style={{ color: mockText }} className="text-xs">
          <span className="font-semibold">12 parents</span> notified · Coach Mike updated
        </p>
      </div>
    </MockShell>
  )
}

function AttentionMockup() {
  return (
    <MockShell>
      <div className="flex items-center justify-between mb-4">
        <p style={{ color: mockMuted }} className="text-[10px] uppercase tracking-[0.18em] font-semibold">
          Attention · Today
        </p>
        <span style={{ color: mockMuted }} className="text-[10px]">Tue, Apr 16</span>
      </div>

      <div className="space-y-2.5">
        {/* Critical */}
        <div
          style={{ backgroundColor: mockSurfaceLift, borderColor: mockBorder }}
          className="rounded-2xl border p-3.5 flex items-start gap-3"
        >
          <span
            style={{ backgroundColor: mockRedSoft, color: mockRed }}
            className="shrink-0 text-[9px] font-bold uppercase tracking-wider rounded px-1.5 py-1"
          >
            Now
          </span>
          <div className="flex-1 min-w-0">
            <p style={{ color: mockText }} className="text-sm font-semibold">
              Coach Mike unavailable for U12 game tomorrow
            </p>
            <p style={{ color: mockMuted }} className="text-xs mt-0.5">3 candidates ranked · top: Coach Sara</p>
          </div>
        </div>

        {/* Today */}
        <div
          style={{ backgroundColor: mockSurfaceLift, borderColor: mockBorder }}
          className="rounded-2xl border p-3.5 flex items-start gap-3"
        >
          <span
            style={{ backgroundColor: mockAmberSoft, color: mockAmber }}
            className="shrink-0 text-[9px] font-bold uppercase tracking-wider rounded px-1.5 py-1"
          >
            Today
          </span>
          <div className="flex-1 min-w-0">
            <p style={{ color: mockText }} className="text-sm font-semibold">
              3 parents asked about Saturday tournament
            </p>
            <p style={{ color: mockMuted }} className="text-xs mt-0.5">Auto-draft reply ready</p>
          </div>
        </div>

        {/* This week */}
        <div
          style={{ backgroundColor: mockSurfaceLift, borderColor: mockBorder }}
          className="rounded-2xl border p-3.5 flex items-start gap-3"
        >
          <span
            style={{ backgroundColor: mockGreenSoft, color: mockGreen }}
            className="shrink-0 text-[9px] font-bold uppercase tracking-wider rounded px-1.5 py-1"
          >
            Week
          </span>
          <div className="flex-1 min-w-0">
            <p style={{ color: mockText }} className="text-sm font-semibold">
              2 unpaid camp registrations
            </p>
            <p style={{ color: mockMuted }} className="text-xs mt-0.5">Send reminder · 1-tap</p>
          </div>
        </div>
      </div>
    </MockShell>
  )
}

function EventMockup() {
  return (
    <MockShell>
      <div className="flex items-center gap-2 mb-3">
        <span style={{ backgroundColor: mockGreen }} className="w-2 h-2 rounded-full" />
        <p style={{ color: mockText }} className="text-sm font-semibold">U14 Tigers</p>
        <span style={{ color: mockMuted }} className="text-xs">· Practice</span>
      </div>

      <p style={{ color: mockText }} className="text-xl font-semibold mb-1">Tue · 6:00 – 7:30 PM</p>
      <p
        style={{ color: mockGreen }}
        className="inline-flex items-center gap-1.5 text-sm font-medium mb-5"
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
          <circle cx="12" cy="10" r="3" />
        </svg>
        Bayshore Park · Open in Maps
      </p>

      <div className="border-t pt-4" style={{ borderColor: mockBorder }}>
        <p style={{ color: mockMuted }} className="text-[10px] uppercase tracking-[0.18em] font-semibold mb-2">
          Attending?
        </p>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            style={{ backgroundColor: mockGreen, color: mockSurface }}
            className="text-sm font-semibold rounded-xl py-2.5"
          >
            Yes
          </button>
          <button
            type="button"
            style={{ backgroundColor: mockSurfaceLift, color: mockText, borderColor: mockBorder }}
            className="text-sm font-semibold rounded-xl py-2.5 border"
          >
            No
          </button>
          <button
            type="button"
            style={{ backgroundColor: mockSurfaceLift, color: mockText, borderColor: mockBorder }}
            className="text-sm font-semibold rounded-xl py-2.5 border"
          >
            Maybe
          </button>
        </div>
      </div>
    </MockShell>
  )
}
