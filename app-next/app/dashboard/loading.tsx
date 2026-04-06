export default function DashboardLoading() {
  return (
    <div className="p-6 md:p-10 max-w-5xl mx-auto animate-pulse">
      <div className="h-8 w-48 bg-dark-secondary rounded-lg mb-2" />
      <div className="h-4 w-32 bg-dark-secondary rounded-lg mb-8" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[1, 2, 3].map(i => (
          <div key={i} className="bg-dark-secondary rounded-2xl p-6 border border-white/5 h-32" />
        ))}
      </div>
    </div>
  )
}
