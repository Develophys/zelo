import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updatePeerPartnerUseCase } from "@/app/container";
import type { UpdatePeerPartnerParams } from "@/ports/manager-admin.port";

export function useUpdatePeerPartner() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdatePeerPartnerParams }) => updatePeerPartnerUseCase.execute(id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-peer-partners"] }),
  });
}
