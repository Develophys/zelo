import { useQuery } from "@tanstack/react-query";
import { listAdminInstitutionSectorsUseCase } from "@/app/container";
import { useAdminSessionStore } from "@/stores/admin-session.store";

export function useAdminInstitutionSectors(institutionId: string | null) {
  const token = useAdminSessionStore((state) => state.token);
  return useQuery({
    queryKey: ["admin-institution-sectors", institutionId, token],
    queryFn: () => listAdminInstitutionSectorsUseCase.execute(token!, institutionId!),
    enabled: token !== null && institutionId !== null,
  });
}
