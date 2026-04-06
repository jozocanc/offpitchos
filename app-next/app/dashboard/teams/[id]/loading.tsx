export default function TeamDetailLoading() {
  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto animate-pulse">
      {/* Header */}
      <div className="mb-8">
        <div className="h-4 w-24 bg-dark-secondary rounded-lg mb-4" />
        <div className="flex items-center gap-3 mt-1">
          <div className="h-8 w-44 bg-dark-secondary rounded-lg" />
          <div className="h-7 w-14 bg-dark-secondary rounded-full" />
        </div>
        <div className="h-4 w-24 bg-dark-secondary rounded-lg mt-2" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left column: Members */}
        <div className="space-y-6">
          {/* Coaches section */}
          <div>
            <div className="h-5 w-20 bg-dark-secondary rounded-lg mb-3" />
            <div className="space-y-2">
              {[1, 2].map(i => (
                <div
                  key={i}
                  className="bg-dark-secondary rounded-xl p-4 border border-white/5 flex items-center gap-3"
                >
                  <div className="w-8 h-8 rounded-full bg-white/5 shrink-0" />
                  <div className="flex-1">
                    <div className="h-4 w-28 bg-white/5 rounded-lg" />
                    <div className="h-3 w-14 bg-white/5 rounded-lg mt-1" />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Parents section */}
          <div>
            <div className="h-5 w-20 bg-dark-secondary rounded-lg mb-3" />
            <div className="space-y-2">
              {[1, 2, 3].map(i => (
                <div
                  key={i}
                  className="bg-dark-secondary rounded-xl p-4 border border-white/5 flex items-center gap-3"
                >
                  <div className="w-8 h-8 rounded-full bg-white/5 shrink-0" />
                  <div className="flex-1">
                    <div className="h-4 w-28 bg-white/5 rounded-lg" />
                    <div className="h-3 w-14 bg-white/5 rounded-lg mt-1" />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Right column: Invite links */}
        <div>
          <div className="bg-dark-secondary rounded-2xl p-6 border border-white/5">
            <div className="flex items-center justify-between mb-4">
              <div className="h-5 w-32 bg-white/5 rounded-lg" />
              <div className="h-9 w-36 bg-white/5 rounded-xl" />
            </div>
            <div className="h-4 w-full bg-white/5 rounded-lg mb-5" />
            <div className="space-y-3">
              <div className="h-10 w-full bg-white/5 rounded-xl" />
              <div className="flex items-center justify-between">
                <div className="h-3 w-28 bg-white/5 rounded-lg" />
                <div className="h-7 w-16 bg-white/5 rounded-lg" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
