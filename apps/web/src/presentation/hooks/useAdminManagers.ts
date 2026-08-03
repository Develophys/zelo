import { useQuery } from "@tanstack/react-query";
import { listManagersUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

export function useAdminManagers() {
  const token = useManagerSessionStore((state) => state.token);
  return useQuery({
    queryKey: ["admin-managers", token],
    queryFn: () => listManagersUseCase.execute(token!),
    enabled: token !== null,
  });
}
