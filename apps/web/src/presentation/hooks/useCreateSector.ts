import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createSectorUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

export function useCreateSector() {
  const token = useManagerSessionStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createSectorUseCase.execute(token!, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-sectors"] }),
  });
}
