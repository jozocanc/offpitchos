export default function MessagesLoading() {
  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <div className="h-8 w-40 bg-dark-secondary rounded-lg" />
          <div className="h-4 w-28 bg-dark-secondary rounded-lg mt-2" />
        </div>
        <div className="h-10 w-40 bg-dark-secondary rounded-xl" />
      </div>

      {/* Filter select */}
      <div className="mb-6">
        <div className="h-10 w-36 bg-dark-secondary rounded-xl" />
      </div>

      {/* Announcement list */}
      <div className="space-y-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-dark-secondary rounded-2xl p-6 border border-white/5">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-white/5 shrink-0" />
                <div>
                  <div className="h-4 w-28 bg-white/5 rounded-lg" />
                  <div className="h-3 w-20 bg-white/5 rounded-lg mt-1" />
                </div>
              </div>
              <div className="h-5 w-16 bg-white/5 rounded-full" />
            </div>
            <div className="h-4 w-full bg-white/5 rounded-lg" />
            <div className="h-4 w-3/4 bg-white/5 rounded-lg mt-2" />
          </div>
        ))}
      </div>
    </div>
  )
}
