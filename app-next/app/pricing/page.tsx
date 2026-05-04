import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import Wordmark from '@/components/wordmark'

export const metadata = {
  title: 'Pricing · OffPitchOS',
  description:
    'Transparent pricing built around your club — one flat monthly rate, no transaction fees, no long contracts. Founding clubs get 50% off for life.',
}

const cream = '#FAF7F2'
const card = '#FFFFFF'
const ink = '#0F1510'
const subtext = '#5C6660'
const forest = '#1F4E3D'
const forestSoft = '#E8F1EB'
const border = '#E8E3DC'

export default async function PricingPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const signedIn = Boolean(user)

  return (
    <main
      style={{ backgroundColor: cream, color: ink }}
      className="min-h-screen antialiased overflow-x-hidden"
    >
      {/* Nav */}
      <nav
        style={{ backgroundColor: `${cream}cc`, borderColor: border }}
        className="sticky top-0 z-40 backdrop-blur border-b"
      >
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link href="/" style={{ color: ink }}>
            <Wordmark size="md" />
          </Link>
          <div className="flex items-center gap-1 sm:gap-2">
            <Link
              href="/pricing"
              style={{ color: ink }}
              className="text-sm font-semibold px-2 sm:px-3 py-2"
            >
              Pricing
            </Link>
            {signedIn ? (
              <Link
                href="/dashboard"
                style={{ backgroundColor: forest, color: cream }}
                className="font-semibold text-sm px-4 py-2 rounded-full hover:opacity-90 transition-opacity"
              >
                Dashboard →
              </Link>
            ) : (
              <>
                <Link
                  href="/login"
                  style={{ color: subtext }}
                  className="hidden sm:inline-block text-sm hover:text-black transition-colors px-3 py-2"
                >
                  Sign in
                </Link>
                <a
                  href="https://calendly.com/jozo-cancar27/offpitchos-demo"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ backgroundColor: forest, color: cream }}
                  className="font-semibold text-sm px-3 sm:px-4 py-2 rounded-full hover:opacity-90 transition-opacity whitespace-nowrap"
                >
                  Book a demo
                </a>
              </>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-4xl mx-auto px-6 pt-24 pb-16 text-center">
        <span
          style={{ color: forest, backgroundColor: forestSoft, borderColor: `${forest}33` }}
          className="inline-block text-[11px] font-semibold uppercase tracking-[0.16em] border rounded-full px-3 py-1.5 mb-7"
        >
          Pricing
        </span>
        <h1
          style={{ color: ink }}
          className="text-5xl md:text-6xl font-semibold tracking-[-0.035em] leading-[1.03]"
        >
          Built around your club,
          <br />
          not a rigid tier.
        </h1>
        <p
          style={{ color: subtext }}
          className="mt-6 text-lg md:text-xl max-w-2xl mx-auto leading-relaxed"
        >
          One flat monthly rate based on your player count. Pay yearly and save 20%. No transaction fees. Cancel anytime.
        </p>
      </section>

      {/* Typical range card */}
      <section className="max-w-4xl mx-auto px-6 pb-8">
        <div
          style={{ backgroundColor: card, borderColor: border }}
          className="rounded-3xl border p-10 md:p-14 text-center shadow-[0_8px_24px_rgba(15,21,16,0.06)]"
        >
          <span
            style={{ color: forest }}
            className="text-[11px] font-semibold uppercase tracking-[0.16em]"
          >
            Typical range
          </span>
          <div
            style={{ color: ink }}
            className="mt-5 text-5xl md:text-7xl font-semibold tracking-[-0.035em] leading-none"
          >
            $149<span style={{ color: subtext }}>&nbsp;–&nbsp;</span>$499
            <span
              style={{ color: subtext }}
              className="text-2xl md:text-3xl font-medium tracking-normal"
            >
              &nbsp;/mo
            </span>
          </div>
          <div className="mt-5 flex items-center justify-center gap-2 flex-wrap">
            <span
              style={{ color: forest, backgroundColor: forestSoft, borderColor: `${forest}33` }}
              className="inline-block text-[11px] font-semibold uppercase tracking-[0.16em] border rounded-full px-3 py-1.5"
            >
              Save 20% annually
            </span>
            <span style={{ color: subtext }} className="text-sm md:text-base">
              $119<span className="opacity-60">&nbsp;–&nbsp;</span>$399/mo billed yearly
            </span>
          </div>
          <p
            style={{ color: subtext }}
            className="mt-6 text-base md:text-lg max-w-xl mx-auto leading-relaxed"
          >
            Clubs we talk to land between $149 and $499/mo depending on size. Pay yearly and knock 20% off. Book a 15-minute call and we&apos;ll give you an exact number on the spot.
          </p>
          <div className="mt-8 flex items-center justify-center gap-3 flex-wrap">
            <a
              href="https://calendly.com/jozo-cancar27/offpitchos-demo"
              target="_blank"
              rel="noopener noreferrer"
              style={{ backgroundColor: forest, color: cream }}
              className="font-semibold px-6 py-3.5 rounded-full hover:opacity-90 transition-opacity text-base"
            >
              Book a 15-min call →
            </a>
            <Link
              href={signedIn ? '/dashboard' : '/signup'}
              style={{ backgroundColor: card, color: ink, borderColor: border }}
              className="font-semibold px-6 py-3.5 rounded-full border hover:bg-[#F5F1EA] transition-colors text-base"
            >
              {signedIn ? 'Go to dashboard' : 'Start free'}
            </Link>
          </div>
        </div>
      </section>

      {/* Founding clubs callout */}
      <section className="max-w-4xl mx-auto px-6 pb-8">
        <div
          style={{ backgroundColor: forest, color: cream }}
          className="rounded-3xl p-10 md:p-12 relative overflow-hidden"
        >
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              background:
                'radial-gradient(ellipse 60% 50% at 30% 20%, rgba(250,247,242,0.12), transparent 70%)',
            }}
          />
          <div className="relative">
            <div className="flex items-center gap-2 mb-4">
              <span
                className="w-2 h-2 rounded-full bg-emerald-300 animate-ping"
                aria-hidden
              />
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em]">
                South Florida clubs · First 10 only
              </span>
            </div>
            <h2 className="text-3xl md:text-4xl font-semibold tracking-[-0.02em] leading-[1.1] mb-4">
              50% off for life.
            </h2>
            <p className="text-base md:text-lg max-w-xl leading-relaxed opacity-90">
              Our first 10 South Florida clubs lock in 50% off forever — roughly $75–$250/mo for life — in exchange for your logo, honest feedback, and a short testimonial when we ship. Design partners, not beta users.
            </p>
          </div>
        </div>
      </section>

      {/* What's included */}
      <section className="max-w-4xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <span
            style={{ color: forest }}
            className="text-[11px] font-semibold uppercase tracking-[0.16em]"
          >
            What&apos;s in every plan
          </span>
          <h2
            style={{ color: ink }}
            className="mt-3 text-3xl md:text-4xl font-semibold tracking-[-0.02em]"
          >
            Everything. No paywalled features.
          </h2>
        </div>

        <div className="grid md:grid-cols-2 gap-5">
          {[
            {
              title: 'Voice commands',
              body: 'Cancel, reschedule, reply to parents — from your car, in plain English.',
            },
            {
              title: 'AI coverage engine',
              body: 'Coach drops out? System finds a replacement and notifies everyone.',
            },
            {
              title: 'Attention panel',
              body: 'What needs you today, ranked by urgency. Not another inbox.',
            },
            {
              title: 'AI tactics board',
              body: 'Session plans, drill library, PDF exports. Built for coaches.',
            },
            {
              title: 'Parent & player portal',
              body: 'Schedules, venues, RSVPs — on every phone, no training required.',
            },
            {
              title: 'Gear, camps & payments',
              body: 'Size spreadsheets gone. Registration and camp checkout built-in.',
            },
          ].map((f) => (
            <div
              key={f.title}
              style={{ backgroundColor: card, borderColor: border }}
              className="rounded-2xl border p-6 shadow-[0_4px_16px_rgba(15,21,16,0.04)]"
            >
              <h3
                style={{ color: ink }}
                className="text-lg font-semibold tracking-[-0.01em] mb-1.5"
              >
                {f.title}
              </h3>
              <p
                style={{ color: subtext }}
                className="text-sm leading-relaxed"
              >
                {f.body}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className="max-w-3xl mx-auto px-6 py-16">
        <div className="text-center mb-10">
          <h2
            style={{ color: ink }}
            className="text-3xl md:text-4xl font-semibold tracking-[-0.02em]"
          >
            Common questions.
          </h2>
        </div>

        <div className="space-y-5">
          {[
            {
              q: 'Why don’t you show exact prices?',
              a: 'Because clubs vary. A 120-player rec-focused club and a 600-player ECNL club need different things. One flat number for both would either overcharge the small one or undersell the big one. The 15-minute call is how we give you an honest number, not a ploy to trap you in a sales funnel.',
            },
            {
              q: 'Are there transaction or add-on fees?',
              a: 'No. What PlayMetrics, Sports Connect, and LeagueApps call “a small percentage” we call a line item on your budget. One monthly rate. Nothing else.',
            },
            {
              q: 'Monthly or annual — what&rsquo;s the difference?',
              a: 'Monthly: pay month-to-month, cancel anytime, no commitment. Annual: lock in a year and take 20% off the monthly rate. Either way, no auto-renew traps — when your term ends, you decide.',
            },
            {
              q: 'What happens after the first 10 founding clubs?',
              a: 'Founding pricing locks for the life of your account. After the first 10 slots are gone, new clubs pay the standard rate for their size.',
            },
            {
              q: 'Is my club’s data safe?',
              a: 'Yes. COPPA-friendly defaults, encrypted at rest, deletable on request within 30 days. We don’t sell data, share it, or train models on it.',
            },
          ].map((item) => (
            <div
              key={item.q}
              style={{ backgroundColor: card, borderColor: border }}
              className="rounded-2xl border p-6 shadow-[0_4px_16px_rgba(15,21,16,0.04)]"
            >
              <h3
                style={{ color: ink }}
                className="text-base md:text-lg font-semibold tracking-[-0.01em] mb-2"
              >
                {item.q}
              </h3>
              <p
                style={{ color: subtext }}
                className="text-sm md:text-base leading-relaxed"
              >
                {item.a}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Final CTA */}
      <section
        style={{ backgroundColor: forest, color: cream }}
        className="relative overflow-hidden"
      >
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(ellipse 55% 50% at 50% 35%, rgba(250,247,242,0.14), transparent 70%)',
          }}
        />
        <div className="relative max-w-3xl mx-auto px-6 py-24 text-center">
          <h2 className="text-4xl md:text-5xl font-semibold tracking-[-0.025em] mb-5">
            Ready for your number?
          </h2>
          <p className="text-base md:text-lg opacity-90 max-w-xl mx-auto mb-9">
            Fifteen minutes. We’ll price your club on the call and you walk out with a written quote.
          </p>
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <a
              href="https://calendly.com/jozo-cancar27/offpitchos-demo"
              target="_blank"
              rel="noopener noreferrer"
              style={{ backgroundColor: cream, color: ink }}
              className="font-semibold px-7 py-3.5 rounded-full hover:-translate-y-0.5 hover:shadow-2xl transition-all text-base"
            >
              Book a 15-min call →
            </a>
            <Link
              href="/"
              style={{ color: cream, borderColor: `${cream}66` }}
              className="font-semibold px-7 py-3.5 rounded-full border hover:bg-white/10 transition-colors text-base"
            >
              Back to home
            </Link>
          </div>
          <p className="text-xs mt-8 opacity-75">
            No credit card · 5-minute setup · Cancel anytime
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer
        style={{ backgroundColor: cream, borderColor: border }}
        className="border-t"
      >
        <div className="max-w-6xl mx-auto px-6 py-10 flex items-center justify-between flex-wrap gap-4">
          <span style={{ color: ink }}>
            <Wordmark size="sm" />
          </span>
          <div className="flex items-center gap-5 text-sm" style={{ color: subtext }}>
            <Link href="/" className="hover:text-black transition-colors">Home</Link>
            <Link href="/pricing" className="hover:text-black transition-colors">Pricing</Link>
            <Link href="/privacy" className="hover:text-black transition-colors">Privacy</Link>
            <Link href="/terms" className="hover:text-black transition-colors">Terms</Link>
          </div>
        </div>
      </footer>
    </main>
  )
}
