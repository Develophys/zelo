import { useInfiniteQuery } from "@tanstack/react-query";
import { listInstitutionsUseCase } from "@/app/container";
import { useAdminSessionStore } from "@/stores/admin-session.store";

export function useAdminInstitutions() {
  const token = useAdminSessionStore((state) => state.token);

  return useInfiniteQuery({
    queryKey: ["admin-institutions", token],
    queryFn: ({ pageParam }) => listInstitutionsUseCase.execute(token!, { cursor: pageParam }),
    initialPageParam: null as string | null,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: token !== null,
    retry: false,
  });
}
