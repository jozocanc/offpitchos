export default function GearLoading() {
  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto animate-pulse">
      {/* Header */}
      <div className="mb-8">
        <div className="h-7 w-24 bg-dark-secondary rounded-lg" />
        <div className="h-4 w-64 bg-dark-secondary rounded-lg mt-2" />
      </div>

      {/* Club-wide stats */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-dark-secondary border border-white/5 rounded-xl p-5">
            <div className="h-3 w-20 bg-white/5 rounded mb-3" />
            <div className="h-8 w-12 bg-white/5 rounded" />
          </div>
        ))}
      </div>

      {/* Completion bar */}
      <div className="bg-dark-secondary border border-white/5 rounded-xl p-5 mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="h-4 w-36 bg-white/5 rounded" />
          <div className="h-4 w-10 bg-white/5 rounded" />
        </div>
        <div className="h-2 w-full bg-white/5 rounded-full" />
      </div>

      {/* Size breakdowns */}
      <div className="grid grid-cols-2 gap-4 mb-8">
        {[1, 2].map(i => (
          <div key={i} className="bg-dark rounded-lg p-3 border border-white/5">
            <div className="h-3 w-24 bg-white/5 rounded mb-3" />
            <div className="flex flex-wrap gap-1.5">
              {[1, 2, 3, 4, 5].map(j => (
                <div key={j} className="h-6 w-12 bg-white/5 rounded" />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Per-team rows */}
      <div className="h-5 w-24 bg-dark-secondary rounded mb-4" />
      <div className="space-y-3">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-dark-secondary border border-white/5 rounded-xl p-5">
            <div className="flex items-center justify-between">
              <div className="flex-1">
                <div className="h-5 w-40 bg-white/5 rounded-lg mb-2" />
                <div className="h-3 w-56 bg-white/5 rounded-lg mb-2" />
                <div className="h-1.5 w-full max-w-md bg-white/5 rounded-full" />
              </div>
              <div className="h-4 w-4 bg-white/5 rounded shrink-0 ml-4" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
