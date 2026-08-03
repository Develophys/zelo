import { useQuery } from "@tanstack/react-query";
import { listInstitutionSectorsUseCase } from "@/app/container";

export function useInstitutionSectors(institutionId: string | null) {
  return useQuery({
    queryKey: ["institution-sectors", institutionId],
    queryFn: () => listInstitutionSectorsUseCase.execute(institutionId!),
    enabled: institutionId !== null,
  });
}
