import { Skeleton } from "@/components/ui/skeleton";

export function ProfilePageSkeleton() {
  return (
    <div className="min-h-screen bg-background">
      {/* Cover Skeleton */}
      <div className="h-48 md:h-64 lg:h-80 w-full bg-muted animate-pulse rounded-b-3xl" />
      
      <div className="container mx-auto px-4">
        <div className="relative pt-20 md:pt-24 pb-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
          {/* Avatar Skeleton */}
          <div className="absolute -top-12 left-4 md:left-8">
            <Skeleton className="h-24 w-24 md:h-32 md:w-32 rounded-full border-4 border-background" />
          </div>

          {/* Info Section Skeleton */}
          <div className="space-y-4 w-full max-w-lg">
            <div className="space-y-2">
              <Skeleton className="h-10 w-48 md:w-64" />
              <Skeleton className="h-5 w-24 md:w-32" />
            </div>
            
            <div className="space-y-2 pt-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
            </div>

            <div className="flex gap-4 pt-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-32" />
            </div>
          </div>

          {/* Actions & Stats Skeleton */}
          <div className="flex flex-col gap-6 md:items-end w-full md:w-auto">
            <div className="flex gap-3">
              <Skeleton className="h-11 w-11 rounded-full" />
              <Skeleton className="h-11 w-32 rounded-full" />
            </div>
            
            <div className="flex gap-8 border-t md:border-t-0 md:border-l border-muted/30 pt-4 md:pt-0 md:pl-10">
              <div className="space-y-1">
                <Skeleton className="h-6 w-10" />
                <Skeleton className="h-3 w-12" />
              </div>
              <div className="space-y-1">
                <Skeleton className="h-6 w-10" />
                <Skeleton className="h-3 w-12" />
              </div>
              <div className="space-y-1">
                <Skeleton className="h-6 w-10" />
                <Skeleton className="h-3 w-12" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs Skeleton */}
      <div className="border-b border-muted/50 h-14 w-full mt-4">
        <div className="container mx-auto px-4 flex gap-8 h-full items-center">
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-20" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>

      {/* Content Skeleton */}
      <div className="container mx-auto px-4 py-8 space-y-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="p-6 border border-muted/50 rounded-2xl space-y-4">
            <div className="flex gap-4">
              <Skeleton className="h-10 w-10 rounded-full" />
              <div className="space-y-2 flex-1">
                <Skeleton className="h-4 w-1/4" />
                <Skeleton className="h-3 w-1/6" />
              </div>
            </div>
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  );
}
