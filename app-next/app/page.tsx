import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import Image from 'next/image'
import Wordmark from '@/components/wordmark'
import ScrollHero from '@/components/scroll-hero'

const cream = '#FAF7F2'
const card = '#FFFFFF'
const ink = '#0F1510'
const subtext = '#5C6660'
const forest = '#1F4E3D'
const border = '#E8E3DC'
const DEMO_URL = 'https://calendly.com/jozo-cancar27/offpitchos-demo'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const signedIn = Boolean(user)

  return (
    <main
      style={{ backgroundColor: cream, color: ink }}
      className="min-h-screen antialiased overflow-x-hidden"
    >
      {/* ── Nav ─────────────────────────────────────────────────────────── */}
      <nav
        style={{ backgroundColor: `${cream}e6`, borderColor: border }}
        className="sticky top-0 z-40 backdrop-blur-xl border-b"
      >
        <div className="max-w-6xl mx-auto px-6 h-[72px] flex items-center justify-between">
          <span style={{ color: ink }}>
            <Wordmark size="md" />
          </span>
          <div className="flex items-center gap-1 sm:gap-2">
            <Link
              href="/pricing"
              style={{ color: subtext }}
              className="text-[15px] hover:text-black transition-colors px-3 py-2"
            >
              Pricing
            </Link>
            {signedIn ? (
              <Link
                href="/dashboard"
                style={{ backgroundColor: forest, color: cream }}
                className="font-semibold text-sm px-4 py-2.5 rounded-full hover:opacity-90 transition-opacity"
              >
                Dashboard →
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  style={{ color: subtext }}
                  className="hidden sm:inline-block text-[15px] hover:text-black transition-colors px-3 py-2"
                >
                  Sign in
                </Link>
                <a
                  href={DEMO_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ backgroundColor: forest, color: cream }}
                  className="font-semibold text-sm px-4 sm:px-5 py-2.5 rounded-full hover:opacity-90 transition-opacity whitespace-nowrap"
                >
                  Book a demo
                </a>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* ── Hero (static — no scroll-linked motion, see component note) ──── */}
      <ScrollHero signedIn={signedIn} />

      {/* ── Who it is built for ─────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 pb-20 md:pb-28">
        <p
          style={{ color: subtext }}
          className="text-center text-[11px] font-semibold uppercase tracking-[0.18em] mb-8"
        >
          Built for the whole organisation
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px rounded-3xl overflow-hidden" style={{ backgroundColor: border }}>
          {[
            { k: 'Youth clubs', v: 'Multiple age groups, one directory' },
            { k: 'Academies', v: 'Full-time staff and training blocks' },
            { k: 'College programs', v: 'Season schedule, film and tactics' },
            { k: 'Multi-site clubs', v: 'Several venues, one source of truth' },
          ].map((x) => (
            <div key={x.k} style={{ backgroundColor: cream }} className="px-6 py-7 text-center">
              <p style={{ color: ink }} className="font-semibold text-[15px] tracking-[-0.01em]">{x.k}</p>
              <p style={{ color: subtext }} className="text-[13px] mt-1.5 leading-relaxed">{x.v}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── The week a club actually has ────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 pb-24 md:pb-32">
        <div className="max-w-3xl mb-14">
          <SectionLabel n="01">The problem</SectionLabel>
          <h2 style={{ color: ink }} className="text-3xl md:text-5xl font-semibold tracking-[-0.03em] text-balance leading-[1.05] mt-4">
            A club does not fail on the pitch. It fails on Sunday night.
          </h2>
          <p style={{ color: subtext }} className="text-[17px] leading-relaxed mt-6">
            A coach pulls out. A field floods. A fixture moves. Every one of those is
            twenty messages, four apps and an hour your director does not have — and it
            happens every single week of the season.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {[
            {
              t: 'The change is the easy part',
              d: 'Moving a session takes ten seconds. Telling everyone, finding cover and updating the record is what eats the evening.',
            },
            {
              t: 'Nothing talks to anything',
              d: 'The schedule lives in one tool, the roster in another, the conversation in a group chat nobody reads twice.',
            },
            {
              t: 'The director becomes the system',
              d: 'When the software cannot react, a person has to. That person is the one who should be building the club.',
            },
          ].map((x) => (
            <div
              key={x.t}
              style={{ backgroundColor: card, borderColor: border }}
              className="rounded-3xl border p-7"
            >
              <h3 style={{ color: ink }} className="font-semibold text-[17px] tracking-[-0.01em] mb-3">{x.t}</h3>
              <p style={{ color: subtext }} className="text-[15px] leading-relaxed">{x.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Product demo video ──────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 pb-24 md:pb-32">
        <div className="text-center mb-10">
          <SectionLabel n="02" center>See it work</SectionLabel>
          <h2 style={{ color: ink }} className="mt-4 text-3xl md:text-5xl font-semibold tracking-[-0.03em] text-balance leading-[1.05]">
            One change. Everyone notified.
          </h2>
          <p style={{ color: subtext }} className="text-[17px] leading-relaxed mt-5 max-w-xl mx-auto">
            No forms to fill in, no chat to copy-paste into. The change propagates to
            every person it touches, and the club carries on.
          </p>
        </div>
        <div
          style={{ backgroundColor: card, borderColor: border }}
          className="rounded-[28px] border overflow-hidden shadow-[0_24px_60px_-30px_rgba(15,21,16,0.28)]"
        >
          <video
            key="product-demo-v3"
            src="/hero/product-demo-v3.mp4"
            autoPlay
            loop
            muted
            playsInline
            preload="auto"
            className="w-full h-auto block"
          />
        </div>
      </section>

      {/* ── Capabilities ────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 pb-24 md:pb-32">
        <div className="max-w-3xl mb-16">
          <SectionLabel n="03">What it does</SectionLabel>
          <h2 style={{ color: ink }} className="text-3xl md:text-5xl font-semibold tracking-[-0.03em] text-balance leading-[1.05] mt-4">
            Built to react, not just record.
          </h2>
        </div>

        <div className="space-y-24 md:space-y-32">
          <Feature
            label="Voice-driven operations"
            title="Say it. It is done."
            body="Cancel a session from the car park. The schedule updates, cover is requested, and everyone affected is told — before you have put your phone down."
            mockup={<VoiceMockup />}
          />
          <Feature
            reverse
            label="Decisions, surfaced"
            title="The five things that actually need you."
            body="Instead of a feed to scroll, the club opens on a ranked list: who is short a coach, which sessions are unconfirmed, what is unanswered. Everything else waits."
            mockup={<AttentionMockup />}
          />
          <Feature
            label="Sessions and tactics"
            title="From an idea to a session plan."
            body="Describe a drill in plain language and Pep AI builds it on the board — animated, printable, attached to the session, and shared with the staff who need it."
            mockup={<EventMockup />}
          />
        </div>
      </section>

      {/* ── Roles ───────────────────────────────────────────────────────── */}
      <section style={{ backgroundColor: card, borderColor: border }} className="border-y">
        <div className="max-w-6xl mx-auto px-6 py-24 md:py-32">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <SectionLabel n="04" center>Every role</SectionLabel>
            <h2 style={{ color: ink }} className="text-3xl md:text-5xl font-semibold tracking-[-0.03em] text-balance leading-[1.05] mt-4">
              One system. Four points of view.
            </h2>
            <p style={{ color: subtext }} className="text-[17px] leading-relaxed mt-5">
              Everyone sees precisely what their job requires — and nothing that belongs
              to someone else.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
            <RoleCard
              label="Director"
              title="Runs the club"
              points={['The week at a glance', 'Coverage gaps before they bite', 'Every team, one directory', 'Reporting without spreadsheets']}
            />
            <RoleCard
              label="Coach"
              title="Runs the session"
              points={['Squad and availability', 'Tactics board with Pep AI', 'Session plans as PDF', 'Request cover in one tap']}
            />
            <RoleCard
              label="Player"
              title="Knows the plan"
              points={['Schedule and location', 'Session plans and clips', 'Feedback from staff', 'Availability in a tap']}
            />
            <RoleCard
              label="Parent"
              title="Stays informed"
              points={['Changes pushed instantly', 'RSVP without a group chat', 'Payments and forms', 'Only their own child']}
            />
          </div>
        </div>
      </section>

      {/* ── Comparison ──────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-24 md:py-32">
        <div className="max-w-3xl mb-14">
          <SectionLabel n="05">The alternative</SectionLabel>
          <h2 style={{ color: ink }} className="text-3xl md:text-5xl font-semibold tracking-[-0.03em] text-balance leading-[1.05] mt-4">
            Four tools that have never met.
          </h2>
          <p style={{ color: subtext }} className="text-[17px] leading-relaxed mt-6">
            Most clubs are running a registration platform, a scheduling app, a group
            chat and a spreadsheet. None of them know the others exist, so the director
            is the integration layer.
          </p>
        </div>
        <div className="grid md:grid-cols-2 gap-5">
          <div
            style={{ backgroundColor: card, borderColor: border }}
            className="rounded-3xl border p-8 md:p-10"
          >
            <p style={{ color: subtext }} className="text-[11px] font-semibold uppercase tracking-[0.18em] mb-6">
              Stitched together
            </p>
            <ul className="space-y-4">
              {[
                'Open four apps to answer one question',
                'Copy the same update into every chat',
                'Find cover by texting coaches one by one',
                'Chase the same parents every week',
                'Rebuild the picture from memory each Sunday',
              ].map((t) => (
                <li key={t} className="flex items-start gap-3 text-[15px]" style={{ color: subtext }}>
                  <span className="mt-[7px] w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: '#C9C2B8' }} />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
          </div>
          <div
            style={{ backgroundColor: ink, borderColor: ink }}
            className="relative rounded-3xl border p-8 md:p-10 overflow-hidden"
          >
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{ background: 'radial-gradient(ellipse 60% 50% at 30% 0%, rgba(250,247,242,0.10), transparent 70%)' }}
            />
            <div className="relative">
              <p style={{ color: '#8FBFA8' }} className="text-[11px] font-semibold uppercase tracking-[0.18em] mb-6">
                OffPitchOS
              </p>
              <ul className="space-y-4">
                {[
                  'One place that already knows your club',
                  'Everyone notified in seconds, nothing typed twice',
                  'Cover requested automatically when a coach drops',
                  'Answers pulled from the club, not from memory',
                  'The season stays current without being maintained',
                ].map((t) => (
                  <li key={t} className="flex items-start gap-3 text-[15px]" style={{ color: cream }}>
                    <span style={{ color: '#34D399' }} className="mt-0.5 flex-shrink-0">✓</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* ── Trust / data ────────────────────────────────────────────────── */}
      <section style={{ backgroundColor: card, borderColor: border }} className="border-y">
        <div className="max-w-6xl mx-auto px-6 py-24 md:py-32">
          <div className="max-w-3xl mb-14">
            <SectionLabel n="06">Your data</SectionLabel>
            <h2 style={{ color: ink }} className="text-3xl md:text-5xl font-semibold tracking-[-0.03em] text-balance leading-[1.05] mt-4">
              A club roster is not a mailing list.
            </h2>
            <p style={{ color: subtext }} className="text-[17px] leading-relaxed mt-6">
              You are handing over the names, ages and whereabouts of children and the
              contact details of every family in your club. That deserves more than a
              privacy policy nobody reads.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { t: 'Isolated by club', d: 'Separation is enforced in the database itself, not by application code that can be bypassed.' },
              { t: 'Scoped to the role', d: 'A parent reaches their own child. A coach reaches their own squad. Enforced per request.' },
              { t: 'Never sold on', d: 'No advertising, no data brokering, no third party gets your families. That is not the business model.' },
              { t: 'Yours to take', d: 'Export your roster and schedule whenever you want, and delete the account permanently if you leave.' },
            ].map((x) => (
              <div key={x.t} style={{ backgroundColor: cream, borderColor: border }} className="rounded-3xl border p-7">
                <h3 style={{ color: ink }} className="font-semibold text-[16px] tracking-[-0.01em] mb-3">{x.t}</h3>
                <p style={{ color: subtext }} className="text-[14px] leading-relaxed">{x.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Founder ─────────────────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-6 py-24 md:py-32">
        <div className="grid md:grid-cols-[auto_1fr] gap-12 md:gap-16 items-center">
          {/* Stacked tilted photos */}
          <div className="relative w-[320px] h-[380px] md:w-[360px] md:h-[420px] mx-auto md:mx-0 shrink-0 group">
            <div
              style={{ borderColor: border, backgroundColor: '#FFFFFF' }}
              className="absolute top-0 left-0 rounded-2xl overflow-hidden border-4 shadow-[0_16px_40px_-16px_rgba(15,21,16,0.35)] -rotate-[8deg] transition-transform duration-500 ease-out group-hover:-rotate-[10deg] group-hover:-translate-x-1 group-hover:scale-[1.03]"
            >
              <Image
                src="/jozo-soccer.jpg"
                alt="Jozo Cancar playing Division I soccer at Florida Atlantic"
                width={210}
                height={280}
                className="block w-[180px] h-[240px] md:w-[210px] md:h-[280px] object-cover"
              />
            </div>
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
            <SectionLabel n="07">Who is behind it</SectionLabel>
            <h2 style={{ color: ink }} className="text-3xl md:text-5xl font-semibold tracking-[-0.03em] text-balance mt-4 mb-6 leading-[1.05]">
              Built by someone who
              <br className="hidden md:block" /> lived the problem.
            </h2>
            <p style={{ color: subtext }} className="text-[17px] leading-relaxed">
              I am Jozo — a former Division I player at Florida Atlantic. Years inside real
              clubs, as a player, on staff and around directors, showed me exactly where the
              existing tools give up: coaches dropping out the night before, families lost in
              group chats, and a director opening six apps to answer one question.
            </p>
            <p style={{ color: subtext }} className="text-[17px] leading-relaxed mt-4">
              OffPitchOS is what those systems should have been from the start. It is built
              for soccer only, and it is built by people who have stood on the touchline.
            </p>
          </div>
        </div>
      </section>

      {/* ── Closing CTA ─────────────────────────────────────────────────── */}
      <section className="px-6 pb-24 md:pb-32">
        <div
          style={{ backgroundColor: ink }}
          className="relative max-w-6xl mx-auto rounded-[32px] overflow-hidden px-6 py-20 md:py-28 text-center"
        >
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0"
            style={{ background: 'radial-gradient(ellipse 55% 50% at 50% 30%, rgba(250,247,242,0.13), transparent 70%)' }}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 opacity-[0.35]"
            style={{
              backgroundImage: 'radial-gradient(circle, rgba(250,247,242,0.22) 1px, transparent 1px)',
              backgroundSize: '22px 22px',
              maskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 80%)',
              WebkitMaskImage: 'radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 80%)',
            }}
          />
          <div className="relative max-w-2xl mx-auto">
            <h2 style={{ color: cream }} className="text-3xl md:text-5xl font-semibold tracking-[-0.03em] text-balance leading-[1.05]">
              See it run your club.
            </h2>
            <p style={{ color: '#B7C0BA' }} className="text-[17px] leading-relaxed mt-5">
              Fifteen minutes, your actual season, your actual roster. If it does not save
              your director a night a week, do not buy it.
            </p>
            <div className="mt-10 flex items-center justify-center gap-3 flex-wrap">
              <a
                href={DEMO_URL}
                target="_blank"
                rel="noopener noreferrer"
                style={{ backgroundColor: cream, color: ink }}
                className="font-semibold px-7 py-4 rounded-full hover:opacity-90 transition-opacity text-base"
              >
                Book a demo →
              </a>
              <Link
                href={signedIn ? '/dashboard' : '/signup'}
                style={{ color: cream, borderColor: 'rgba(250,247,242,0.28)' }}
                className="font-semibold px-7 py-4 rounded-full border hover:bg-[rgba(250,247,242,0.08)] transition-colors text-base"
              >
                {signedIn ? 'Go to dashboard' : 'Start free'}
              </Link>
            </div>
            <p style={{ color: '#8C9690' }} className="text-[13px] mt-8">
              Soccer only · No setup fee · Your data stays yours
            </p>
          </div>
        </div>
      </section>

      {/* ── Footer ──────────────────────────────────────────────────────── */}
      <footer style={{ backgroundColor: cream, borderColor: border }} className="border-t">
        <div className="max-w-6xl mx-auto px-6 py-14">
          <div className="flex flex-wrap items-start justify-between gap-10">
            <div className="max-w-xs">
              <span style={{ color: ink }}>
                <Wordmark size="sm" />
              </span>
              <p style={{ color: subtext }} className="text-[14px] leading-relaxed mt-4">
                The operating system for soccer clubs, academies and college programs.
              </p>
            </div>
            <div className="flex gap-14 text-[14px]">
              <div>
                <p style={{ color: ink }} className="font-semibold mb-3">Product</p>
                <ul className="space-y-2.5" style={{ color: subtext }}>
                  <li><Link href="/pricing" className="hover:text-black transition-colors">Pricing</Link></li>
                  <li><a href={DEMO_URL} target="_blank" rel="noopener noreferrer" className="hover:text-black transition-colors">Book a demo</a></li>
                  <li><Link href="/login" className="hover:text-black transition-colors">Sign in</Link></li>
                </ul>
              </div>
              <div>
                <p style={{ color: ink }} className="font-semibold mb-3">Company</p>
                <ul className="space-y-2.5" style={{ color: subtext }}>
                  <li><a href="mailto:hello@offpitchos.com" className="hover:text-black transition-colors">Contact</a></li>
                  <li><Link href="/privacy" className="hover:text-black transition-colors">Privacy</Link></li>
                  <li><Link href="/terms" className="hover:text-black transition-colors">Terms</Link></li>
                </ul>
              </div>
            </div>
          </div>
          <div style={{ borderColor: border, color: subtext }} className="border-t mt-12 pt-7 text-[13px]">
            © {new Date().getFullYear()} OffPitchOS
          </div>
        </div>
      </footer>
    </main>
  )
}

/** Small numbered eyebrow used to give the page a consistent spine. */
function SectionLabel({ n, children, center }: { n: string; children: React.ReactNode; center?: boolean }) {
  return (
    <div className={`flex items-center gap-3 ${center ? 'justify-center' : ''}`}>
      <span
        style={{ color: forest, borderColor: `${forest}33`, backgroundColor: '#E8F1EB' }}
        className="text-[10px] font-semibold tracking-[0.1em] border rounded-full w-7 h-7 flex items-center justify-center"
      >
        {n}
      </span>
      <span style={{ color: forest }} className="text-[11px] font-semibold uppercase tracking-[0.18em]">
        {children}
      </span>
    </div>
  )
}

/** Alternating text/mockup row used for the capability section. */
function Feature({
  label, title, body, mockup, reverse,
}: {
  label: string; title: string; body: string; mockup: React.ReactNode; reverse?: boolean
}) {
  return (
    <div className="grid md:grid-cols-2 gap-10 md:gap-14 items-center">
      <div className={reverse ? 'md:order-2' : ''}>
        <span style={{ color: forest }} className="text-[11px] font-semibold uppercase tracking-[0.18em]">
          {label}
        </span>
        <h3 style={{ color: ink }} className="text-2xl md:text-4xl font-semibold tracking-[-0.025em] text-balance mt-3 mb-5 leading-[1.08]">
          {title}
        </h3>
        <p style={{ color: subtext }} className="text-[17px] leading-relaxed">{body}</p>
      </div>
      <div className={reverse ? 'md:order-1' : ''}>{mockup}</div>
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
            <p style={{ color: mockMuted }} className="text-xs mt-0.5">Reply to all in one tap</p>
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
