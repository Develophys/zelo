import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteSectorAdminUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

export function useDeleteSector() {
  const token = useManagerSessionStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSectorAdminUseCase.execute(token!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-managers"] });
      queryClient.invalidateQueries({ queryKey: ["admin-sectors"] });
    },
  });
}
