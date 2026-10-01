import { Skeleton, SkeletonPage } from '@/components/skeleton'

export default function Loading() {
  return (
    <SkeletonPage className="p-6 md:p-10 max-w-6xl mx-auto space-y-4">
      <Skeleton className="h-8 w-48 rounded" />
      <Skeleton className="h-10 w-full rounded" />
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[16/10] rounded-lg" />
        ))}
      </div>
    </SkeletonPage>
  )
}
