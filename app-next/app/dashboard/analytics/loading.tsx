export default function AnalyticsLoading() {
  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto animate-pulse">
      {/* Header */}
      <div className="mb-6">
        <div className="h-8 w-40 bg-dark-secondary rounded-lg" />
        <div className="h-4 w-56 bg-dark-secondary rounded-lg mt-2" />
      </div>

      {/* Period selector */}
      <div className="flex gap-2 mb-8">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="h-10 w-20 bg-dark-secondary rounded-lg" />
        ))}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-dark-secondary border border-white/5 rounded-xl p-5">
            <div className="h-3 w-16 bg-white/5 rounded mb-3" />
            <div className="h-8 w-12 bg-white/5 rounded" />
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {[1, 2].map(i => (
          <div key={i} className="bg-dark-secondary border border-white/5 rounded-xl p-5">
            <div className="h-4 w-40 bg-white/5 rounded mb-4" />
            <div className="h-[220px] bg-white/5 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}
