import { useQuery } from "@tanstack/react-query";
import { listSectorsUseCase } from "@/app/container";

export function useAdminSectors() {
  return useQuery({
    queryKey: ["admin-sectors"],
    queryFn: () => listSectorsUseCase.execute(),
  });
}
