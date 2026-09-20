import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createSectorUseCase } from "@/app/container";

export function useCreateSector() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { name: string; inviteCode?: string }) => createSectorUseCase.execute(params),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-sectors"] }),
  });
}
