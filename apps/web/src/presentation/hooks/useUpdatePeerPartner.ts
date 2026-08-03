import { useMutation, useQueryClient } from "@tanstack/react-query";
import { updatePeerPartnerUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";
import type { UpdatePeerPartnerParams } from "@/ports/manager-admin.port";

export function useUpdatePeerPartner() {
  const token = useManagerSessionStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdatePeerPartnerParams }) => updatePeerPartnerUseCase.execute(token!, id, patch),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-peer-partners"] }),
  });
}
