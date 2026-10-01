import { Skeleton, SkeletonCard, SkeletonPage } from '@/components/skeleton'

// Mirrors messages-client: title, Announcements / Direct tabs, count +
// action row, team filter, then announcement cards.
export default function MessagesLoading() {
  return (
    <SkeletonPage className="p-6 md:p-10 max-w-5xl mx-auto">
      <Skeleton className="h-9 w-40 mb-6" />

      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b border-white/5 pb-3">
        <Skeleton className="h-5 w-28" />
        <Skeleton className="h-5 w-16" />
      </div>

      <div className="flex items-center justify-between mb-6 gap-4">
        <Skeleton className="h-4 w-28" />
        <Skeleton className="h-10 w-44 rounded-xl" />
      </div>

      <Skeleton className="h-10 w-36 rounded-xl mb-6" />

      <div className="space-y-4">
        {[1, 2, 3, 4].map(i => (
          <SkeletonCard key={i} className="rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              <Skeleton className="h-5 w-14 rounded-full" />
              <Skeleton className="h-3 w-12" />
            </div>
            <Skeleton className="h-5 w-56 max-w-full" />
            <Skeleton className="h-3.5 w-full mt-2" />
            <Skeleton className="h-3.5 w-2/3 mt-1.5" />
            <Skeleton className="h-3 w-32 mt-3" />
          </SkeletonCard>
        ))}
      </div>
    </SkeletonPage>
  )
}
