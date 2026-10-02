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
          Built for teams with a coaching staff
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-px rounded-3xl overflow-hidden" style={{ backgroundColor: border }}>
          {[
            { k: 'College programs', v: 'Season schedule, film and tactics' },
            { k: 'Junior colleges', v: 'A full squad run by a small staff' },
            { k: 'Academies', v: 'Full-time staff and training blocks' },
            { k: 'Club first teams', v: 'One squad, one staff, one plan' },
          ].map((x) => (
            <div key={x.k} style={{ backgroundColor: cream }} className="px-6 py-7 text-center">
              <p style={{ color: ink }} className="font-semibold text-[15px] tracking-[-0.01em]">{x.k}</p>
              <p style={{ color: subtext }} className="text-[13px] mt-1.5 leading-relaxed">{x.v}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── The week a team actually has ────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 pb-24 md:pb-32">
        <div className="max-w-3xl mb-14">
          <SectionLabel n="01">The problem</SectionLabel>
          <h2 style={{ color: ink }} className="text-3xl md:text-5xl font-semibold tracking-[-0.03em] text-balance leading-[1.05] mt-4">
            A team does not fail on the pitch. It fails on Sunday night.
          </h2>
          <p style={{ color: subtext }} className="text-[17px] leading-relaxed mt-6">
            A bus time changes. A field floods. A fixture moves. Every one of those is
            twenty messages, four apps and an hour your head coach does not have. And it
            happens every single week of the season.
          </p>
        </div>
        <div className="grid md:grid-cols-3 gap-5">
          {[
            {
              t: 'The change is the easy part',
              d: 'Moving a session takes ten seconds. Telling everyone and updating the record is what eats the evening.',
            },
            {
              t: 'Nothing talks to anything',
              d: 'The schedule lives in one tool, the roster in another, the conversation in a group chat nobody reads twice.',
            },
            {
              t: 'The head coach becomes the system',
              d: 'When the software cannot react, a person has to. That person is the one who should be coaching the team.',
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
            every person it touches, and the team carries on.
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
            body="Cancel a session from the parking lot. The schedule updates and everyone affected is told before you have put your phone down."
            mockup={<VoiceMockup />}
          />
          <Feature
            reverse
            label="Decisions, surfaced"
            title="The five things that actually need you."
            body="Instead of a feed to scroll, your day opens on a ranked list: who flagged in this morning's check-in, who still owes kit sizes, what is coming up next. Everything else waits."
            mockup={<Screenshot src="/home/attention.jpg" width={1430} height={840} alt="Needs your attention list with flagged players, missing kit sizes and today's sessions" />}
          />
        </div>
      </section>

      {/* ── Game day ────────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 pb-24 md:pb-32">
        <div className="max-w-3xl mb-16">
          <SectionLabel n="04">Game day</SectionLabel>
          <h2 style={{ color: ink }} className="text-3xl md:text-5xl font-semibold tracking-[-0.03em] text-balance leading-[1.05] mt-4">
            Everything around the ninety minutes.
          </h2>
          <p style={{ color: subtext }} className="text-[17px] leading-relaxed mt-5">
            Who is fit, who starts, where everyone stands on a corner, and what the
            numbers said afterwards. Built for the way a college staff actually runs a match week.
          </p>
        </div>

        <div className="space-y-24 md:space-y-32">
          <Feature
            label="Game report"
            title="Upload the box score. Every profile updates."
            body="Drop in the stats sheet in any format: PDF, spreadsheet, Word or a photo. OffPitchOS reads it, matches every line to your roster and shows it to you first. Fix anything that looks wrong, save, and minutes, goals, assists and saves land on each player's season record."
            mockup={<Screenshot src="/home/game-report.jpg" width={1538} height={760} alt="Game report review screen with each player's minutes, goals and assists" />}
          />
          <Feature
            reverse
            label="Game plan"
            title="Lineup, corners and tactics on one printout."
            body="Pick the formation, tap a player into each spot and names and numbers fill in. Set attacking and defending corners on the same plan, add your tactics, then choose exactly which pages to print for the locker room."
            mockup={<Screenshot src="/home/game-plan.jpg" width={1176} height={1025} alt="Lineup builder showing a 4-3-3 with names and numbers" />}
          />
          <Feature
            label="Readiness"
            title="Know who is fit before training starts."
            body="Every morning players rate sleep, soreness and energy and mark themselves fit, limited or out. It takes them ten seconds. You open one board and see the whole squad, with a note on anyone carrying a knock."
            mockup={<Screenshot src="/home/readiness.jpg" width={1372} height={886} alt="Readiness board with fit, limited and out players" />}
          />
          <Feature
            reverse
            label="Match page and travel"
            title="The visitors know where to go. So does your bus."
            body="Send the visiting team one link with arrival time, parking, locker room and kit colours. For away games, the trip plan sits on the fixture: departure, return, dress code and what to bring, pushed to every player."
            mockup={<MatchTravelShots />}
          />
        </div>
      </section>

      {/* ── Roles ───────────────────────────────────────────────────────── */}
      <section style={{ backgroundColor: card, borderColor: border }} className="border-y">
        <div className="max-w-6xl mx-auto px-6 py-24 md:py-32">
          <div className="text-center max-w-3xl mx-auto mb-16">
            <SectionLabel n="05" center>Every role</SectionLabel>
            <h2 style={{ color: ink }} className="text-3xl md:text-5xl font-semibold tracking-[-0.03em] text-balance leading-[1.05] mt-4">
              One system. Three points of view.
            </h2>
            <p style={{ color: subtext }} className="text-[17px] leading-relaxed mt-5">
              Everyone sees precisely what their job requires, and nothing that belongs
              to someone else.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-5">
            <RoleCard
              label="Head coach"
              title="Runs the program"
              points={['The week at a glance', 'Travel, kit and forms in one place', 'The whole roster, one directory', 'Reporting without spreadsheets']}
            />
            <RoleCard
              label="Assistant coach"
              title="Runs the session"
              points={['Squad and availability', 'Tactics board with Pep AI', 'Session plans as PDF', 'Feedback logged per player']}
            />
            <RoleCard
              label="Player"
              title="Knows the plan"
              points={['Schedule, travel and location', 'Changes pushed instantly', 'Availability and forms in a tap', 'Feedback from staff']}
            />
          </div>
        </div>
      </section>

      {/* ── Comparison ──────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-24 md:py-32">
        <div className="max-w-3xl mb-14">
          <SectionLabel n="06">The alternative</SectionLabel>
          <h2 style={{ color: ink }} className="text-3xl md:text-5xl font-semibold tracking-[-0.03em] text-balance leading-[1.05] mt-4">
            Four tools that have never met.
          </h2>
          <p style={{ color: subtext }} className="text-[17px] leading-relaxed mt-6">
            Most programs are running a scheduling app, a group chat, a shared drive
            and a spreadsheet. None of them know the others exist, so the head coach
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
                'Collect travel docs and forms by hand',
                'Chase players for sizes, travel docs and availability',
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
                  'One place that already knows your team',
                  'Everyone notified in seconds, nothing typed twice',
                  'Players send sizes, forms and availability themselves',
                  'Answers pulled from the team, not from memory',
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
            <SectionLabel n="07">Your data</SectionLabel>
            <h2 style={{ color: ink }} className="text-3xl md:text-5xl font-semibold tracking-[-0.03em] text-balance leading-[1.05] mt-4">
              A team roster is not a mailing list.
            </h2>
            <p style={{ color: subtext }} className="text-[17px] leading-relaxed mt-6">
              You are handing over the names, dates of birth, travel plans and contact
              details of every player on your roster. That deserves more than a privacy
              policy nobody reads.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              { t: 'Isolated by team', d: 'Separation is enforced in the database itself, not by application code that can be bypassed.' },
              { t: 'Scoped to the role', d: 'A player sees their own profile. A coach reaches their own squad. Enforced per request.' },
              { t: 'Never sold on', d: 'No advertising, no data brokering, no third party gets your players. That is not the business model.' },
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

      {/* ── Founders ────────────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 py-24 md:py-32">
        <div className="max-w-3xl mb-16">
          <SectionLabel n="08">Who is behind it</SectionLabel>
          <h2 style={{ color: ink }} className="text-3xl md:text-5xl font-semibold tracking-[-0.03em] leading-[1.05] mt-4 text-balance">
            Built by someone who played the game.
          </h2>
          <p style={{ color: subtext }} className="text-[17px] leading-relaxed mt-6">
            OffPitchOS is not built by someone who read about the problem. It is built by
            a player who lived it inside real programs, which is why it is soccer only and
            why it argues with the way the existing tools behave.
          </p>
        </div>

        <div className="max-w-md">
          <Founder
            name="Jozo Cancar"
            role="Founder · Builds the product"
            actionSrc="/jozo-soccer.jpg"
            actionAlt="Jozo Cancar playing college soccer"
            portraitSrc="/jozo.jpg"
            portraitAlt="Jozo Cancar, founder of OffPitchOS"
            priority
          >
            Played at Tyler Junior College, then Division I at Florida Atlantic. Years around real teams, as a player and
            on staff, showed me where the existing tools give up: coaches dropping out the
            night before, players lost in group chats, a head coach opening six apps to
            answer one question. I build the thing that should have existed already.
          </Founder>
        </div>
      </section>


      {/* ── College pilot offer ─────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-6 pb-24 md:pb-32">
        <div
          style={{ backgroundColor: card, borderColor: border }}
          className="rounded-[28px] border p-8 md:p-12 grid md:grid-cols-[1.1fr_1fr] gap-10 items-center"
        >
          <div>
            <span style={{ color: forest }} className="text-[11px] font-semibold uppercase tracking-[0.18em]">
              For college programs
            </span>
            <h2 style={{ color: ink }} className="text-3xl md:text-4xl font-semibold tracking-[-0.03em] text-balance leading-[1.08] mt-3">
              Free pilot for the 2026 season.
            </h2>
            <p style={{ color: subtext }} className="text-[17px] leading-relaxed mt-5">
              Run your fall season on OffPitchOS at no cost. If it does not earn its place
              by the end of the season, walk away. Nothing to cancel.
            </p>
            <a
              href={DEMO_URL}
              target="_blank"
              rel="noopener noreferrer"
              style={{ backgroundColor: forest, color: cream }}
              className="inline-block font-semibold px-7 py-4 rounded-full hover:opacity-90 transition-opacity text-base mt-8"
            >
              Apply for the pilot →
            </a>
          </div>
          <ul className="space-y-4">
            {[
              'Your roster and full schedule loaded for you',
              'Every feature, the whole staff and every player',
              'Set up in one call, players join with a team code',
              'No card, no contract, no setup fee',
            ].map(point => (
              <li key={point} className="flex items-start gap-3 text-[16px]" style={{ color: ink }}>
                <span style={{ color: forest }} className="mt-0.5">✓</span>
                <span>{point}</span>
              </li>
            ))}
          </ul>
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
              See it run your team.
            </h2>
            <p style={{ color: '#B7C0BA' }} className="text-[17px] leading-relaxed mt-5">
              Fifteen minutes, your actual season, your actual roster. If it does not save
              your staff a night a week, do not buy it.
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
                The operating system for soccer teams: the coaching staff and every player.
              </p>
            </div>
            <div className="flex gap-10 sm:gap-14 text-[14px]">
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

/**
 * One founder: a tilted pair of photos (on the pitch behind, portrait in front)
 * above their name and story.
 */
function Founder({
  name, role, actionSrc, actionAlt, portraitSrc, portraitAlt, priority, children,
}: {
  name: string; role: string
  actionSrc: string; actionAlt: string
  portraitSrc: string; portraitAlt: string
  priority?: boolean
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="relative w-[280px] h-[320px] sm:w-[320px] sm:h-[350px] mx-auto md:mx-0 shrink-0 group mb-8">
        {/* Behind: on the pitch */}
        <div
          style={{ borderColor: border, backgroundColor: '#FFFFFF' }}
          className="absolute top-0 left-0 rounded-2xl overflow-hidden border-4 shadow-[0_16px_40px_-16px_rgba(15,21,16,0.35)] -rotate-[8deg] transition-transform duration-500 ease-out group-hover:-rotate-[10deg] group-hover:-translate-x-1 group-hover:scale-[1.03]"
        >
          <Image
            src={actionSrc}
            alt={actionAlt}
            width={190}
            height={250}
            className="block w-[160px] h-[210px] sm:w-[190px] sm:h-[250px] object-cover"
          />
        </div>
        {/* In front: portrait */}
        <div
          style={{ borderColor: border, backgroundColor: '#FFFFFF' }}
          className="absolute bottom-0 right-0 rounded-2xl overflow-hidden border-4 shadow-[0_24px_60px_-20px_rgba(15,21,16,0.45)] rotate-[6deg] transition-transform duration-500 ease-out group-hover:rotate-[8deg] group-hover:translate-x-1 group-hover:scale-[1.04]"
        >
          <Image
            src={portraitSrc}
            alt={portraitAlt}
            width={190}
            height={250}
            priority={priority}
            className="block w-[160px] h-[210px] sm:w-[190px] sm:h-[250px] object-cover"
          />
        </div>
      </div>

      <h3 style={{ color: ink }} className="text-2xl md:text-3xl font-semibold tracking-[-0.025em]">
        {name}
      </h3>
      <p style={{ color: forest }} className="text-[13px] font-semibold mt-1.5 mb-4">
        {role}
      </p>
      <p style={{ color: subtext }} className="text-[16px] leading-relaxed">
        {children}
      </p>
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

/** A real product screenshot in a light frame. */
function Screenshot({ src, alt, width, height }: { src: string; alt: string; width: number; height: number }) {
  return (
    <div
      style={{ backgroundColor: card, borderColor: border }}
      className="rounded-[22px] border p-2 shadow-[0_24px_60px_-30px_rgba(15,21,16,0.35)]"
    >
      <Image
        src={src}
        alt={alt}
        width={width}
        height={height}
        sizes="(min-width: 768px) 560px, 100vw"
        className="block w-full h-auto rounded-[16px]"
      />
    </div>
  )
}

/** Away-trip card with the visitors' match page layered over its corner. */
function MatchTravelShots() {
  return (
    <div className="relative pb-40 sm:pb-52">
      <Screenshot src="/home/travel.jpg" width={1568} height={622} alt="Away game with the bus departure, return and itinerary" />
      <div
        style={{ backgroundColor: card, borderColor: border }}
        className="absolute right-3 bottom-0 w-[52%] sm:w-[46%] rounded-[18px] border p-1.5 shadow-[0_24px_60px_-24px_rgba(15,21,16,0.45)] rotate-[2deg]"
      >
        <Image
          src="/home/match-page.jpg"
          alt="Match day page for the visiting team with kickoff, venue, arrival and parking"
          width={830}
          height={1000}
          sizes="(min-width: 768px) 260px, 52vw"
          className="block w-full h-auto rounded-[13px]"
        />
      </div>
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

// ---- Voice mockup (CSS): the voice flow cannot be screenshotted ----

const mockSurface = '#0F1510'
const mockSurfaceLift = '#1A211C'
const mockText = '#FAF7F2'
const mockMuted = '#8C9690'
const mockGreen = '#34D399'
const mockGreenSoft = 'rgba(52, 211, 153, 0.16)'
const mockBorder = 'rgba(255, 255, 255, 0.08)'
const mockRed = '#F87171'
const mockRedSoft = 'rgba(248, 113, 113, 0.16)'

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
            &ldquo;Cancel training tonight&rdquo;
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
          <p style={{ color: mockMuted }} className="text-xs">Men&rsquo;s Soccer</p>
        </div>
        <p style={{ color: mockText }} className="text-base font-semibold line-through opacity-60">
          Training · 3:30 – 5:30 PM
        </p>
        <p style={{ color: mockMuted }} className="text-xs mt-1">Main Stadium · Field 1</p>
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
          <span className="font-semibold">24 players</span> notified · Staff updated
        </p>
      </div>
    </MockShell>
  )
}


