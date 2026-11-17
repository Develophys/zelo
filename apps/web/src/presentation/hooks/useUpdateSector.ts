import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updateSectorUseCase } from "@/app/container";
import type { UpdateSectorParams } from "@/ports/manager-admin.port";

export function useUpdateSector() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateSectorParams }) => updateSectorUseCase.execute(id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-sectors"] }),
  });
}
