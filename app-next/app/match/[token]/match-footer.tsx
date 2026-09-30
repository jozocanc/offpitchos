// Every home game puts this page in front of another coach. Keep it quiet:
// one line, no pitch beyond what the product does.
export default function MatchFooter() {
  return (
    <footer className="pt-8 mt-10 border-t border-white/10 text-center">
      <a
        href="https://offpitchos.com/?utm_source=match_sheet&utm_medium=referral"
        target="_blank"
        rel="noopener"
        className="text-gray text-xs hover:text-green transition-colors"
      >
        Built with <span className="text-green font-semibold">OffPitchOS</span>: run your team&apos;s week in one place
      </a>
    </footer>
  )
}
