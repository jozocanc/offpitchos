import MatchFooter from './match-footer'

// Unknown token, or the home staff switched the link off.
export default function MatchSheetNotFound() {
  return (
    <div className="min-h-screen bg-dark text-white">
      <div className="max-w-xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-green">
          Match day info
        </p>
        <h1 className="text-3xl sm:text-4xl font-semibold tracking-[-0.03em] mt-3 leading-tight">
          This page isn&apos;t available
        </h1>
        <p className="text-gray text-[15px] leading-relaxed mt-4">
          The link may be mistyped, or the home team has turned it off. Ask the home coach
          to send you a fresh link.
        </p>
        <MatchFooter />
      </div>
    </div>
  )
}
