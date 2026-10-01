import { Skeleton, SkeletonPage } from '@/components/skeleton'

export default function CoachesLoading() {
  return (
    <SkeletonPage className="p-6 md:p-10 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <Skeleton className="h-8 w-40 rounded-lg" />
          <Skeleton className="h-4 w-44 rounded-lg mt-2" />
        </div>
        <Skeleton className="h-10 w-32 rounded-xl" />
      </div>

      {/* Active Coaches */}
      <div className="mb-10">
        <Skeleton className="h-5 w-32 rounded-lg mb-4" />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[1, 2, 3, 4].map(i => (
            <div
              key={i}
              className="bg-dark-secondary rounded-2xl p-5 border border-white/5 flex items-center gap-4"
            >
              <Skeleton className="w-10 h-10 rounded-full shrink-0" />
              <div>
                <Skeleton className="h-4 w-28 rounded-lg" />
                <Skeleton className="h-3 w-14 rounded-lg mt-1.5" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Pending Invites */}
      <div>
        <Skeleton className="h-5 w-32 rounded-lg mb-4" />
        <div className="space-y-3">
          {[1, 2].map(i => (
            <div key={i} className="bg-dark-secondary rounded-2xl p-5 border border-white/5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div>
                  <Skeleton className="h-4 w-44 rounded-lg" />
                  <Skeleton className="h-3 w-28 rounded-lg mt-1.5" />
                </div>
                <Skeleton className="h-6 w-16 rounded-full" />
              </div>
              <Skeleton className="h-10 w-full rounded-xl" />
            </div>
          ))}
        </div>
      </div>
    </SkeletonPage>
  )
}
