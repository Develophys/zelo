import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateManagerAdminUseCase } from "@/app/container";
import type { UpdateManagerParams } from "@/ports/manager-admin.port";

export function useUpdateManager() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateManagerParams }) => updateManagerAdminUseCase.execute(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-managers"] });
      queryClient.invalidateQueries({ queryKey: ["admin-sectors"] });
    },
  });
}
