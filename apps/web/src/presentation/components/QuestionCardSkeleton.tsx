import { Skeleton } from '@/presentation/ui/Skeleton';

const OPTION_SKELETON_COUNT = 4;

export function QuestionCardSkeleton() {
  return (
    <div>
      <Skeleton className="mb-6.5 mt-2.5 h-7 w-3/4 rounded-md" />
      <div className="flex flex-col gap-2.75">
        {Array.from({ length: OPTION_SKELETON_COUNT }, (_, index) => (
          <Skeleton key={index} className="h-13 w-full rounded-control" />
        ))}
      </div>
    </div>
  );
}
