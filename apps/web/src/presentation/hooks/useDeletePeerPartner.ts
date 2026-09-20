import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deletePeerPartnerAdminUseCase } from "@/app/container";

export function useDeletePeerPartner() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deletePeerPartnerAdminUseCase.execute(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-peer-partners"] }),
  });
}
