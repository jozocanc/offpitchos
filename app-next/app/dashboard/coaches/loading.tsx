export default function CoachesLoading() {
  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto animate-pulse">
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="h-8 w-40 bg-dark-secondary rounded-lg" />
          <div className="h-4 w-44 bg-dark-secondary rounded-lg mt-2" />
        </div>
        <div className="h-10 w-32 bg-dark-secondary rounded-xl" />
      </div>

      {/* Active Coaches */}
      <div className="mb-10">
        <div className="h-5 w-32 bg-dark-secondary rounded-lg mb-4" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div
              key={i}
              className="bg-dark-secondary rounded-2xl p-5 border border-white/5 flex items-center gap-4"
            >
              <div className="w-10 h-10 rounded-full bg-white/5 shrink-0" />
              <div>
                <div className="h-4 w-28 bg-white/5 rounded-lg" />
                <div className="h-3 w-14 bg-white/5 rounded-lg mt-1.5" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pending Invites */}
      <div>
        <div className="h-5 w-32 bg-dark-secondary rounded-lg mb-4" />
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="bg-dark-secondary rounded-2xl p-5 border border-white/5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <div className="h-4 w-44 bg-white/5 rounded-lg" />
                  <div className="h-3 w-28 bg-white/5 rounded-lg mt-1.5" />
                </div>
                <div className="h-6 w-16 bg-white/5 rounded-full" />
              </div>
              <div className="h-10 w-full bg-white/5 rounded-xl" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
