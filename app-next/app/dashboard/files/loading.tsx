import { Skeleton, SkeletonPage } from '@/components/skeleton'

export default function FilesLoading() {
  return (
    <SkeletonPage className="p-6 md:p-10 max-w-5xl mx-auto">
      <div className="mb-8">
        <Skeleton className="h-7 w-24 rounded-lg" />
        <Skeleton className="h-4 w-72 rounded-lg mt-2 max-w-full" />
      </div>

      <div className="flex items-center gap-3 mb-6">
        <Skeleton className="h-10 flex-1 rounded-lg" />
        <Skeleton className="h-10 w-28 rounded-lg" />
      </div>

      <div className="space-y-2">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="bg-dark-secondary border border-white/5 rounded-xl p-4 flex items-center gap-4">
            <Skeleton className="h-10 w-10 rounded" />
            <div className="flex-1">
              <Skeleton className="h-4 w-48 rounded mb-2" />
              <Skeleton className="h-3 w-32 rounded" />
            </div>
            <Skeleton className="h-8 w-20 rounded" />
          </div>
        ))}
      </div>
    </SkeletonPage>
  )
}
