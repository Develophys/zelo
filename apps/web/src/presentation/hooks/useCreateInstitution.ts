import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createInstitutionUseCase } from "@/app/container";
import { useAdminSessionStore } from "@/stores/admin-session.store";
import type { CreateInstitutionParams } from "@/ports/admin-institution.port";

export function useCreateInstitution() {
  const token = useAdminSessionStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (params: CreateInstitutionParams) => createInstitutionUseCase.execute(token!, params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-institutions"] });
    },
  });
}
