"use client"
import Link from "next/link"
import { ContainerScroll } from "@/components/ui/container-scroll-animation"

export default function ScrollHero({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="bg-[#FAF7F2]">
      <ContainerScroll
        titleComponent={
          <div className="px-6">
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
        }
      >
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
      </ContainerScroll>
    </section>
  )
}
