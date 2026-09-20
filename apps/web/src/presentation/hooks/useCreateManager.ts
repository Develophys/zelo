import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createManagerAdminUseCase } from "@/app/container";
import type { CreateManagerParams } from "@/ports/manager-admin.port";

export function useCreateManager() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: CreateManagerParams) => createManagerAdminUseCase.execute(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-managers"] });
      queryClient.invalidateQueries({ queryKey: ["admin-sectors"] });
    },
  });
}
