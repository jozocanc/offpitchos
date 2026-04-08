export default function CampsLoading() {
  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto animate-pulse">
      {/* Header */}
      <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
        <div>
          <div className="h-8 w-32 bg-dark-secondary rounded-lg" />
          <div className="h-4 w-48 bg-dark-secondary rounded-lg mt-2" />
        </div>
        <div className="h-10 w-36 bg-dark-secondary rounded-xl" />
      </div>

      {/* Overview stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-dark-secondary border border-white/5 rounded-xl p-5">
            <div className="h-3 w-20 bg-white/5 rounded mb-3" />
            <div className="h-8 w-16 bg-white/5 rounded" />
          </div>
        ))}
      </div>

      {/* Camp cards */}
      <div className="space-y-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-dark-secondary rounded-2xl p-6 border border-white/5">
            <div className="flex items-start justify-between mb-4">
              <div className="flex-1">
                <div className="h-5 w-56 bg-white/5 rounded-lg mb-2" />
                <div className="h-3 w-40 bg-white/5 rounded-lg" />
              </div>
              <div className="h-6 w-20 bg-white/5 rounded-full shrink-0" />
            </div>
            <div className="h-2 w-full bg-white/5 rounded-full mb-3" />
            <div className="grid grid-cols-3 gap-3">
              <div className="h-10 bg-white/5 rounded" />
              <div className="h-10 bg-white/5 rounded" />
              <div className="h-10 bg-white/5 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
