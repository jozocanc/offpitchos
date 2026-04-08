export default function AskLoading() {
  return (
    <div className="flex flex-col h-[100dvh] max-w-3xl mx-auto p-6 md:px-10 md:py-8 animate-pulse">
      {/* Header */}
      <div className="mb-4 shrink-0">
        <div className="h-7 w-28 bg-dark-secondary rounded-lg" />
        <div className="h-4 w-80 bg-dark-secondary rounded-lg mt-2" />
      </div>

      {/* Welcome state placeholder */}
      <div className="flex-1 min-h-0 flex flex-col items-center justify-center">
        <div className="h-10 w-10 bg-dark-secondary rounded-full mb-4" />
        <div className="h-5 w-56 bg-dark-secondary rounded-lg mb-2" />
        <div className="h-3 w-72 bg-dark-secondary rounded-lg mb-6" />
        <div className="flex flex-wrap justify-center gap-2">
          {[1, 2, 3, 4].map(i => (
            <div key={i} className="h-8 w-36 bg-dark-secondary rounded-lg" />
          ))}
        </div>
      </div>

      {/* Input bar */}
      <div className="pt-4 border-t border-white/5">
        <div className="flex gap-3">
          <div className="flex-1 h-12 bg-dark-secondary rounded-xl" />
          <div className="h-12 w-16 bg-dark-secondary rounded-xl" />
        </div>
      </div>
    </div>
  )
}
