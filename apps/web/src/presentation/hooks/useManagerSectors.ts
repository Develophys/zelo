import { useQuery } from "@tanstack/react-query";
import { listAccessibleSectorsUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

export function useManagerSectors() {
  const token = useManagerSessionStore((state) => state.token);
  return useQuery({
    queryKey: ["manager-accessible-sectors", token],
    queryFn: () => listAccessibleSectorsUseCase.execute(token!),
    enabled: token !== null,
  });
}
