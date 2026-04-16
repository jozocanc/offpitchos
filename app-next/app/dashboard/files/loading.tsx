export default function FilesLoading() {
  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto animate-pulse">
      <div className="mb-8">
        <div className="h-7 w-24 bg-dark-secondary rounded-lg" />
        <div className="h-4 w-72 bg-dark-secondary rounded-lg mt-2" />
      </div>

      <div className="flex items-center gap-3 mb-6">
        <div className="h-10 flex-1 bg-dark-secondary rounded-lg" />
        <div className="h-10 w-28 bg-dark-secondary rounded-lg" />
      </div>

      <div className="space-y-2">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-dark-secondary border border-white/5 rounded-xl p-4 flex items-center gap-4">
            <div className="h-10 w-10 bg-white/5 rounded" />
            <div className="flex-1">
              <div className="h-4 w-48 bg-white/5 rounded mb-2" />
              <div className="h-3 w-32 bg-white/5 rounded" />
            </div>
            <div className="h-8 w-20 bg-white/5 rounded" />
          </div>
        ))}
      </div>
    </div>
  )
}
