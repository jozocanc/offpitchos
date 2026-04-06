export default function CoverageLoading() {
  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="h-8 w-40 bg-dark-secondary rounded-lg" />
          <div className="h-4 w-32 bg-dark-secondary rounded-lg mt-2" />
        </div>
      </div>

      {/* Section label */}
      <div className="h-3 w-28 bg-dark-secondary rounded-lg mb-3" />

      {/* Request list */}
      <div className="space-y-3 mb-8">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-dark-secondary rounded-2xl p-5 border border-white/5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="h-5 w-44 bg-white/5 rounded-lg" />
                <div className="flex items-center gap-3 mt-2">
                  <div className="h-3 w-24 bg-white/5 rounded-lg" />
                  <div className="h-3 w-20 bg-white/5 rounded-lg" />
                </div>
                <div className="h-3 w-36 bg-white/5 rounded-lg mt-2" />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="h-6 w-20 bg-white/5 rounded-full" />
                <div className="h-8 w-16 bg-white/5 rounded-lg" />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Resolved section label */}
      <div className="h-3 w-32 bg-dark-secondary rounded-lg mb-3" />

      {/* Resolved list */}
      <div className="space-y-3">
        {[1, 2].map(i => (
          <div key={i} className="bg-dark-secondary rounded-2xl p-5 border border-white/5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="h-5 w-40 bg-white/5 rounded-lg" />
                <div className="h-3 w-28 bg-white/5 rounded-lg mt-2" />
              </div>
              <div className="h-6 w-20 bg-white/5 rounded-full" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
