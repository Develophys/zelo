import { useQuery } from "@tanstack/react-query";
import { listInstitutionsUseCase } from "@/app/container";
import { useAdminSessionStore } from "@/stores/admin-session.store";

export function useAdminInstitutions() {
  const token = useAdminSessionStore((state) => state.token);

  return useQuery({
    queryKey: ["admin-institutions", token],
    queryFn: () => listInstitutionsUseCase.execute(token!),
    enabled: token !== null,
    retry: false,
  });
}
