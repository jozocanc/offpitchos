import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

const cream = '#FAF7F2'
const card = '#FFFFFF'
const ink = '#0F1510'
const subtext = '#5C6660'
const forest = '#1F4E3D'
const forestHover = '#2D6B56'
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
          <Link
            href="/signup"
            style={{ backgroundColor: forest, color: cream }}
            className="font-semibold px-6 py-3.5 rounded-full hover:opacity-90 transition-opacity text-base"
          >
            Start free →
          </Link>
          <a
            href="mailto:hello@offpitchos.com?subject=OffPitchOS%20demo"
            style={{ borderColor: border, color: ink }}
            className="border font-semibold px-6 py-3.5 rounded-full hover:bg-white transition-colors text-base"
          >
            Book a demo
          </a>
        </div>
        <p style={{ color: subtext }} className="text-xs mt-8">
          No credit card · Works on any device · Replaces SportsEngine, TeamSnap, GroupMe & spreadsheets
        </p>
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
              href="mailto:hello@offpitchos.com?subject=OffPitchOS%20demo"
              style={{ color: cream, borderColor: `${cream}40` }}
              className="border font-semibold px-8 py-4 rounded-full hover:bg-white/10 transition-colors text-base"
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
