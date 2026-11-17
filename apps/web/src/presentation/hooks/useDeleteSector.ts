import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deleteSectorAdminUseCase } from "@/app/container";

export function useDeleteSector() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteSectorAdminUseCase.execute(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-managers"] });
      queryClient.invalidateQueries({ queryKey: ["admin-sectors"] });
    },
  });
}
