export default function ScheduleLoading() {
  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <div className="h-8 w-40 bg-dark-secondary rounded-lg" />
          <div className="h-4 w-24 bg-dark-secondary rounded-lg mt-2" />
        </div>
        <div className="flex items-center gap-3">
          <div className="h-10 w-24 bg-dark-secondary rounded-xl" />
          <div className="h-10 w-32 bg-dark-secondary rounded-xl" />
        </div>
      </div>

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 w-36 bg-dark-secondary rounded-xl" />
        <div className="h-10 w-36 bg-dark-secondary rounded-xl" />
      </div>

      {/* Date group header */}
      <div className="h-4 w-32 bg-dark-secondary rounded-lg mb-3" />

      {/* Event list */}
      <div className="space-y-3">
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="bg-dark-secondary rounded-2xl p-5 border border-white/5">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="h-5 w-48 bg-white/5 rounded-lg" />
                <div className="flex items-center gap-3 mt-2">
                  <div className="h-3 w-20 bg-white/5 rounded-lg" />
                  <div className="h-3 w-24 bg-white/5 rounded-lg" />
                  <div className="h-3 w-16 bg-white/5 rounded-lg" />
                </div>
              </div>
              <div className="h-6 w-20 bg-white/5 rounded-full shrink-0" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
