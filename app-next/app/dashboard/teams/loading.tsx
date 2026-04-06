export default function TeamsLoading() {
  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto animate-pulse">
      <div className="flex items-center justify-between mb-8">
        <div>
          <div className="h-8 w-36 bg-dark-secondary rounded-lg" />
          <div className="h-4 w-28 bg-dark-secondary rounded-lg mt-2" />
        </div>
        <div className="h-10 w-28 bg-dark-secondary rounded-xl" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-dark-secondary rounded-2xl p-6 border border-white/5">
            <div className="flex items-start justify-between mb-3">
              <div className="h-5 w-32 bg-white/5 rounded-lg" />
              <div className="h-6 w-12 bg-white/5 rounded-full" />
            </div>
            <div className="h-4 w-40 bg-white/5 rounded-lg" />
            <div className="mt-3 pt-3 border-t border-white/5">
              <div className="h-3 w-48 bg-white/5 rounded-lg" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
