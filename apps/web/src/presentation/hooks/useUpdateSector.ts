import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateSectorUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";
import type { UpdateSectorParams } from "@/ports/manager-admin.port";

export function useUpdateSector() {
  const token = useManagerSessionStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateSectorParams }) => updateSectorUseCase.execute(token!, id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-sectors"] }),
  });
}
