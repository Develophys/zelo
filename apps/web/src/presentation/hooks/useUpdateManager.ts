import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateManagerAdminUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";
import type { UpdateManagerParams } from "@/ports/manager-admin.port";

export function useUpdateManager() {
  const token = useManagerSessionStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateManagerParams }) => updateManagerAdminUseCase.execute(token!, id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-managers"] });
      queryClient.invalidateQueries({ queryKey: ["admin-sectors"] });
    },
  });
}
