import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteManagerAdminUseCase } from "@/app/container";

export function useDeleteManager() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteManagerAdminUseCase.execute(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-managers"] });
      queryClient.invalidateQueries({ queryKey: ["admin-sectors"] });
    },
  });
}
