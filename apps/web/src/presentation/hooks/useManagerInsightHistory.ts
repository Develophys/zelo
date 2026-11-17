import { useInfiniteQuery } from "@tanstack/react-query";
import { getManagerInsightHistoryUseCase } from "@/app/container";

export function useManagerInsightHistory() {
  return useInfiniteQuery({
    queryKey: ["manager-insight-history"],
    queryFn: ({ pageParam }) => getManagerInsightHistoryUseCase.execute({ cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    retry: false,
  });
}
