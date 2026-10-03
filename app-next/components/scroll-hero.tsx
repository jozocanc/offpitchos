import Link from "next/link"
import Image from "next/image"

// Static hero — headline + real dashboard screenshot.
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
            <span className="sm:hidden">College &amp; club soccer</span>
            <span className="hidden sm:inline">For college and club soccer teams</span>
          </span>
          <h1 className="text-[2.15rem] leading-[1.05] sm:text-6xl sm:leading-[1.02] md:text-7xl font-semibold tracking-[-0.035em] sm:tracking-[-0.038em] text-[#0F1510] text-balance">
            The operating system
            <br className="hidden sm:block" />{" "}
            for serious soccer teams.
          </h1>
          <p className="mt-7 text-lg md:text-xl text-[#5C6660] max-w-2xl mx-auto leading-relaxed">
            Scheduling, player comms, gear, travel and tactics in one system that reacts on
            its own. Your staff coach the team instead of chasing spreadsheets.
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
              15-minute call · Soccer only · Built by a former Division I player ·
              Replaces TeamSnap, the shared drive and the spreadsheet
            </span>
          </p>
        </div>

        {/* Real product shot: the dashboard home */}
        <div
          className="max-w-5xl mx-auto w-[92%] border-[6px] border-[#1F4E3D] p-2 md:p-3 bg-[#FFFFFF] rounded-[30px]"
          style={{
            boxShadow:
              "0 40px 80px -20px rgba(15,21,16,0.18), 0 20px 40px -20px rgba(31,78,61,0.12)",
          }}
        >
          <Image
            src="/home/attention.jpg"
            alt="OffPitchOS dashboard: the things that need the head coach today, with flagged players, missing kit sizes and today's sessions"
            width={1430}
            height={840}
            priority
            sizes="(min-width: 1024px) 1000px, 92vw"
            className="block w-full h-auto rounded-2xl"
          />
        </div>
      </div>
    </section>
  )
}
