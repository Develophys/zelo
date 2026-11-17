import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createPeerPartnerUseCase } from "@/app/container";
import type { CreatePeerPartnerParams } from "@/ports/manager-admin.port";

export function useCreatePeerPartner() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: CreatePeerPartnerParams) => createPeerPartnerUseCase.execute(params),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-peer-partners"] }),
  });
}
