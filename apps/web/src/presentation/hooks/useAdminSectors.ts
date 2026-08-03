import { useQuery } from "@tanstack/react-query";
import { listSectorsUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

export function useAdminSectors() {
  const token = useManagerSessionStore((state) => state.token);
  return useQuery({
    queryKey: ["admin-sectors", token],
    queryFn: () => listSectorsUseCase.execute(token!),
    enabled: token !== null,
  });
}
