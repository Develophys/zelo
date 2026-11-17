import { useQuery } from "@tanstack/react-query";
import { listAccessibleSectorsUseCase } from "@/app/container";

export function useManagerSectors(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["manager-accessible-sectors"],
    queryFn: () => listAccessibleSectorsUseCase.execute(),
    enabled: options?.enabled ?? true,
  });
}
