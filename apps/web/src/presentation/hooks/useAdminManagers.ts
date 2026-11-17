import { useQuery } from "@tanstack/react-query";
import { listManagersUseCase } from "@/app/container";

export function useAdminManagers() {
  return useQuery({
    queryKey: ["admin-managers"],
    queryFn: () => listManagersUseCase.execute(),
  });
}
