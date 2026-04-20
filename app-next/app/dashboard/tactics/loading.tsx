export default function Loading() {
  return (
    <div className="p-6 animate-pulse space-y-4">
      <div className="h-8 w-48 bg-white/10 rounded" />
      <div className="h-10 w-full bg-white/5 rounded" />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="aspect-[16/10] bg-white/5 rounded-lg" />
        ))}
      </div>
    </div>
  )
}
