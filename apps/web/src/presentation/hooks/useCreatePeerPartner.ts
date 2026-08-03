import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createPeerPartnerUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";
import type { CreatePeerPartnerParams } from "@/ports/manager-admin.port";

export function useCreatePeerPartner() {
  const token = useManagerSessionStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: CreatePeerPartnerParams) => createPeerPartnerUseCase.execute(token!, params),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-peer-partners"] }),
  });
}
