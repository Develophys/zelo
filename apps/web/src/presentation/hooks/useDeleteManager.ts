import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteManagerAdminUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

export function useDeleteManager() {
  const token = useManagerSessionStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteManagerAdminUseCase.execute(token!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-managers"] });
      queryClient.invalidateQueries({ queryKey: ["admin-sectors"] });
    },
  });
}
