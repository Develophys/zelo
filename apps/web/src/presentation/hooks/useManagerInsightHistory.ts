import { useInfiniteQuery } from "@tanstack/react-query";
import { getManagerInsightHistoryUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

export function useManagerInsightHistory() {
  const token = useManagerSessionStore((state) => state.token);

  return useInfiniteQuery({
    queryKey: ["manager-insight-history", token],
    queryFn: ({ pageParam }) => getManagerInsightHistoryUseCase.execute(token!, { cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: token !== null,
    retry: false,
  });
}
