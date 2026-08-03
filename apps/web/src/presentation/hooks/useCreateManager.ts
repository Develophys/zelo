import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createManagerAdminUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";
import type { CreateManagerParams } from "@/ports/manager-admin.port";

export function useCreateManager() {
  const token = useManagerSessionStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: CreateManagerParams) => createManagerAdminUseCase.execute(token!, params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-managers"] });
      queryClient.invalidateQueries({ queryKey: ["admin-sectors"] });
    },
  });
}
