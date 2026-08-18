import Link from "next/link"

// Static hero — headline + pitch-video card.
// Deliberately no scroll-linked motion: the previous Framer Motion
// `ContainerScroll` version broke rendering across multiple sessions
// (white card / missing title). This is a plain server component so
// there is no client JS, no hydration step, nothing to break.
export default function ScrollHero({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="bg-[#FAF7F2]">
      <div className="relative w-full pt-14 pb-24 md:pt-24 md:pb-32">
        {/* Headline */}
        <div className="max-w-5xl mx-auto px-6 text-center mb-12 md:mb-16">
          <span className="inline-block text-[10px] sm:text-[11px] font-semibold uppercase tracking-[0.16em] text-[#1F4E3D] bg-[#E8F1EB] border border-[#1F4E3D33] rounded-full px-4 py-1.5 mb-8 max-w-full">
            <span className="sm:hidden">Clubs · Academies · College</span>
            <span className="hidden sm:inline">For clubs, academies and college programs</span>
          </span>
          <h1 className="text-[2.75rem] leading-[1.02] sm:text-6xl md:text-7xl font-semibold tracking-[-0.038em] text-[#0F1510]">
            The operating system
            <br />
            for serious soccer clubs.
          </h1>
          <p className="mt-7 text-lg md:text-xl text-[#5C6660] max-w-2xl mx-auto leading-relaxed">
            Scheduling, communication, coverage and tactics in one system that reacts on
            its own. Your director runs the club instead of firefighting it.
          </p>
          <div className="mt-10 flex items-center justify-center gap-3 flex-wrap">
            <a
              href="https://calendly.com/jozo-cancar27/offpitchos-demo"
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold px-7 py-4 rounded-full bg-[#1F4E3D] text-[#FAF7F2] hover:opacity-90 transition-opacity text-base"
            >
              Book a demo →
            </a>
            <Link
              href={signedIn ? "/dashboard" : "/signup"}
              className="font-semibold px-7 py-4 rounded-full border border-[#E8E3DC] text-[#0F1510] bg-[#FFFFFF] hover:bg-[#F5F1EA] transition-colors text-base"
            >
              {signedIn ? "Go to dashboard" : "Start free"}
            </Link>
          </div>
          <p className="text-[13px] mt-8 text-[#5C6660] px-2 max-w-lg mx-auto leading-relaxed">
            <span className="sm:hidden">15-minute call · Soccer only · Built by a former D1 player</span>
            <span className="hidden sm:inline">
              15-minute call · Soccer only · Built by a former Division I player · Replaces
              SportsEngine, TeamSnap, GroupMe and the spreadsheet
            </span>
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
