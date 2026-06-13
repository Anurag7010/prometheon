import { SkeletonCard, Skeleton } from "@/components/ui/Skeleton";

export default function DocumentDetailLoading() {
  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      {/* Back link skeleton */}
      <Skeleton className="h-4 w-24" />

      {/* Header skeleton */}
      <div className="space-y-3">
        <Skeleton className="h-10 w-2/3" />
        <div className="flex gap-3">
          <Skeleton className="h-6 w-20 rounded-full" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>

      {/* Document info card skeleton */}
      <SkeletonCard />

      {/* Query history skeleton */}
      <div className="space-y-4">
        <div className="flex justify-between">
          <Skeleton className="h-6 w-32" />
          <Skeleton className="h-10 w-44 rounded-md" />
        </div>
        <SkeletonCard />
      </div>
    </div>
  );
}
