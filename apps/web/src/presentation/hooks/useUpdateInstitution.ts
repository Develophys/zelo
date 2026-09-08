import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateInstitutionUseCase } from "@/app/container";
import { useAdminSessionStore } from "@/stores/admin-session.store";
import type { UpdateInstitutionParams } from "@/ports/admin-institution.port";

export function useUpdateInstitution() {
  const token = useAdminSessionStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateInstitutionParams }) =>
      updateInstitutionUseCase.execute(token!, id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-institutions"] });
    },
  });
}
