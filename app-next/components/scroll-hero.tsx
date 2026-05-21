import Link from "next/link"

// Static hero — headline + pitch-video card.
// Deliberately no scroll-linked motion: the previous Framer Motion
// `ContainerScroll` version broke rendering across multiple sessions
// (white card / missing title). This is a plain server component so
// there is no client JS, no hydration step, nothing to break.
export default function ScrollHero({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="bg-[#FAF7F2]">
      <div className="relative w-full pt-12 pb-24 md:pt-20 md:pb-32">
        {/* Headline */}
        <div className="max-w-5xl mx-auto px-6 text-center mb-12 md:mb-16">
          <span className="inline-block text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.14em] sm:tracking-[0.16em] text-[#1F4E3D] bg-[#E8F1EB] border border-[#1F4E3D33] rounded-full px-3 py-1.5 mb-7 max-w-full">
            <span className="sm:hidden">AI-driven · Soccer-only</span>
            <span className="hidden sm:inline">AI-driven · Soccer-only · Built by a former D1 player</span>
          </span>
          <h1 className="text-5xl md:text-7xl font-semibold tracking-[-0.035em] leading-[1.03] text-[#0F1510]">
            The AI operating system
            <br />
            for soccer clubs.
          </h1>
          <p className="mt-6 text-lg md:text-xl text-[#5C6660] max-w-2xl mx-auto leading-relaxed">
            When coaches drop out, venues change, or parents pile in — OffPitchOS handles it. Your DOC leads, not firefights.
          </p>
          <div className="mt-9 flex items-center justify-center gap-3 flex-wrap">
            <a
              href="https://calendly.com/jozo-cancar27/offpitchos-demo"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold px-6 py-3.5 rounded-full bg-[#1F4E3D] text-[#FAF7F2] hover:opacity-90 transition-opacity text-base"
            >
              Book a demo →
            </a>
            <Link
              href={signedIn ? "/dashboard" : "/signup"}
              className="font-semibold px-6 py-3.5 rounded-full border border-[#E8E3DC] text-[#0F1510] bg-[#FFFFFF] hover:bg-[#F5F1EA] transition-colors text-base"
            >
              {signedIn ? "Go to dashboard" : "Start free"}
            </Link>
          </div>
          <p className="text-xs mt-7 text-[#5C6660] px-2 max-w-md mx-auto leading-relaxed">
            <span className="sm:hidden">15-min call · Replaces SportsEngine, TeamSnap &amp; GroupMe</span>
            <span className="hidden sm:inline">15-min call · See it run your club · Replaces SportsEngine, TeamSnap, GroupMe &amp; spreadsheets</span>
          </p>
        </div>

        {/* Pitch-video card — static, white card with forest border */}
        <div
          className="max-w-5xl mx-auto w-[92%] h-[22rem] sm:h-[28rem] md:h-[36rem] border-[6px] border-[#1F4E3D] p-2 md:p-4 bg-[#FFFFFF] rounded-[30px]"
          style={{
            boxShadow:
              "0 40px 80px -20px rgba(15,21,16,0.18), 0 20px 40px -20px rgba(31,78,61,0.12)",
          }}
        >
          <div className="h-full w-full overflow-hidden rounded-2xl bg-[#FAF7F2]">
            <video
              src="/hero/pitch-hero.mp4"
              poster="/hero/pitch-hero-poster.jpg"
              autoPlay
              loop
              muted
              playsInline
              preload="auto"
              className="w-full h-full object-cover bg-[#0F1510]"
            />
          </div>
        </div>
      </div>
    </section>
  )
}
