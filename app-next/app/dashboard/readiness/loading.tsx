export default function ReadinessLoading() {
  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto animate-pulse">
      <div className="mb-8">
        <div className="h-7 w-32 bg-dark-secondary rounded-lg" />
        <div className="h-4 w-72 bg-dark-secondary rounded-lg mt-2" />
      </div>
      <div className="flex gap-2 mb-6">
        {[1, 2, 3, 4, 5, 6, 7].map(i => (
          <div key={i} className="h-9 w-16 bg-dark-secondary rounded-full" />
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-dark-secondary border border-white/5 rounded-xl h-20" />
        ))}
      </div>
      <div className="space-y-2">
        {[1, 2, 3, 4, 5, 6].map(i => (
          <div key={i} className="bg-dark-secondary border border-white/5 rounded-xl h-16" />
        ))}
      </div>
    </div>
  )
}
