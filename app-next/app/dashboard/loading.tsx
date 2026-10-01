import { Skeleton, SkeletonPage } from '@/components/skeleton'
import DashboardBodySkeleton from './dashboard-skeleton'

export default function DashboardLoading() {
  return (
    <SkeletonPage className="p-6 md:p-10 max-w-5xl mx-auto">
      <div className="mb-10">
        <Skeleton className="h-9 w-72 max-w-full" />
        <Skeleton className="h-4 w-64 max-w-full mt-2" />
      </div>
      <DashboardBodySkeleton />
    </SkeletonPage>
  )
}
