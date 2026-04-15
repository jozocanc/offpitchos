import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user) redirect('/dashboard')

  return (
    <main className="min-h-screen bg-dark text-white antialiased">
      {/* Nav */}
      <nav className="sticky top-0 z-40 bg-dark/80 backdrop-blur border-b border-white/5">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="font-black text-xl tracking-tight">
            OffPitch<span className="text-green">OS</span>
          </span>
          <div className="flex items-center gap-3">
            <Link href="/login" className="text-sm text-gray hover:text-white transition-colors px-3 py-2">
              Sign in
            </Link>
            <Link
              href="/signup"
              className="bg-green text-dark font-bold text-sm px-4 py-2 rounded-lg hover:shadow-[0_0_20px_rgba(0,255,135,0.4)] transition"
            >
              Get started
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-24 text-center">
        <span className="inline-block text-xs font-bold uppercase tracking-[0.2em] text-green bg-green/10 border border-green/20 rounded-full px-3 py-1.5 mb-6">
          Built by directors, for directors
        </span>
        <h1 className="text-5xl md:text-7xl font-black tracking-tight leading-[1.05] mb-6">
          The AI-driven club
          <br />
          <span className="text-green">operating system</span>
          <br />
          for youth soccer.
        </h1>
        <p className="text-gray text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
          Coaches drop out, venues change, parents have questions. OffPitchOS reacts automatically — so your director of coaching can lead, not firefight.
        </p>
        <div className="flex items-center justify-center gap-4 flex-wrap">
          <Link
            href="/signup"
            className="bg-green text-dark font-bold px-6 py-3.5 rounded-xl hover:shadow-[0_0_30px_rgba(0,255,135,0.5)] transition text-base"
          >
            Start free →
          </Link>
          <a
            href="mailto:hello@offpitchos.com?subject=OffPitchOS%20demo"
            className="border border-white/10 text-white font-semibold px-6 py-3.5 rounded-xl hover:bg-white/5 transition text-base"
          >
            Book a demo
          </a>
        </div>
        <p className="text-gray text-xs mt-6">
          No credit card · Works on any device · Replaces SportsEngine, TeamSnap, GroupMe & spreadsheets
        </p>
      </section>

      {/* Problem */}
      <section className="border-t border-white/5 bg-[#0C1B32]">
        <div className="max-w-6xl mx-auto px-6 py-20">
          <h2 className="text-3xl md:text-4xl font-black text-center mb-3">
            Running a club is chaos.
          </h2>
          <p className="text-gray text-center max-w-2xl mx-auto mb-12">
            The DOC logs into six apps just to answer one question. We fixed that.
          </p>
          <div className="grid md:grid-cols-2 gap-4 max-w-3xl mx-auto">
            {[
              'Coach cancels 30 min before practice — who covers?',
              'Parent asks "what time Saturday?" for the 50th time',
              'Tournament gear order stuck in a spreadsheet',
              'Camp payments missing and registrations unclear',
              'Announcements buried in group texts',
              '"Where\'s the venue?" — sent by every new parent',
            ].map((pain, i) => (
              <div key={i} className="bg-dark-secondary rounded-xl p-4 border border-white/5 flex items-start gap-3">
                <span className="text-red text-lg leading-none mt-0.5">✕</span>
                <p className="text-gray text-sm">{pain}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="max-w-6xl mx-auto px-6 py-24">
        <h2 className="text-3xl md:text-4xl font-black text-center mb-3">
          OffPitchOS handles it.
        </h2>
        <p className="text-gray text-center max-w-2xl mx-auto mb-16">
          Every feature is judged by one question: does this help the DOC handle sudden changes without manual work?
        </p>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
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
      <section className="border-y border-white/5 bg-[#0C1B32]">
        <div className="max-w-6xl mx-auto px-6 py-24">
          <h2 className="text-3xl md:text-4xl font-black text-center mb-16">
            One platform. Three perfect workflows.
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
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
      <section className="max-w-6xl mx-auto px-6 py-24">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-green">
              Privacy by default
            </span>
            <h2 className="text-3xl md:text-4xl font-black mt-3 mb-6">
              Your club data is <span className="text-green">yours.</span>
            </h2>
            <p className="text-gray leading-relaxed mb-4">
              We don&rsquo;t sell it. We don&rsquo;t share it. We don&rsquo;t train AI models on it. Kids&rsquo; data is handled with COPPA-friendly defaults, encrypted at rest, and deletable in 30 days on request.
            </p>
            <div className="flex gap-5 mt-6 text-sm">
              <Link href="/privacy" className="text-green hover:underline font-semibold">Privacy policy →</Link>
              <Link href="/terms" className="text-green hover:underline font-semibold">Terms →</Link>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <TrustCard label="US data centers" />
            <TrustCard label="Encrypted at rest" />
            <TrustCard label="GDPR / CCPA ready" />
            <TrustCard label="COPPA-friendly" />
            <TrustCard label="No ad tracking" />
            <TrustCard label="Zero data resale" />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-white/5">
        <div className="max-w-3xl mx-auto px-6 py-24 text-center">
          <h2 className="text-4xl md:text-5xl font-black tracking-tight mb-5">
            Ready to stop firefighting?
          </h2>
          <p className="text-gray text-lg mb-10">
            Set up your club in under five minutes. Free while we grow with you.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Link
              href="/signup"
              className="bg-green text-dark font-bold px-8 py-4 rounded-xl hover:shadow-[0_0_30px_rgba(0,255,135,0.5)] transition text-base"
            >
              Start free →
            </Link>
            <a
              href="mailto:hello@offpitchos.com?subject=OffPitchOS%20demo"
              className="border border-white/10 text-white font-semibold px-8 py-4 rounded-xl hover:bg-white/5 transition text-base"
            >
              Book a demo
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5 bg-[#0A1628]">
        <div className="max-w-6xl mx-auto px-6 py-10 flex flex-wrap items-center justify-between gap-4 text-sm">
          <div>
            <span className="font-black tracking-tight">
              OffPitch<span className="text-green">OS</span>
            </span>
            <span className="text-gray ml-3">© {new Date().getFullYear()}</span>
          </div>
          <div className="flex gap-5 text-gray">
            <Link href="/privacy" className="hover:text-white">Privacy</Link>
            <Link href="/terms" className="hover:text-white">Terms</Link>
            <a href="mailto:hello@offpitchos.com" className="hover:text-white">Contact</a>
            <Link href="/login" className="hover:text-white">Sign in</Link>
          </div>
        </div>
      </footer>
    </main>
  )
}

function FeatureCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="bg-dark-secondary rounded-2xl p-6 border border-white/5 hover:border-green/30 transition-colors">
      <h3 className="font-bold text-white mb-2">{title}</h3>
      <p className="text-gray text-sm leading-relaxed">{body}</p>
    </div>
  )
}

function RoleCard({ label, title, points }: { label: string; title: string; points: string[] }) {
  return (
    <div className="bg-dark-secondary rounded-2xl p-6 border border-white/5">
      <span className="text-xs font-bold uppercase tracking-[0.15em] text-green">{label}</span>
      <h3 className="font-bold text-white text-xl mt-2 mb-5">{title}</h3>
      <ul className="space-y-3">
        {points.map((p, i) => (
          <li key={i} className="flex items-start gap-2 text-gray text-sm">
            <span className="text-green mt-0.5">✓</span>
            <span>{p}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function TrustCard({ label }: { label: string }) {
  return (
    <div className="bg-dark-secondary rounded-xl p-4 border border-white/5 text-center">
      <p className="text-sm font-semibold text-white">{label}</p>
    </div>
  )
}
