import { useMutation, useQueryClient } from "@tanstack/react-query";
import { deletePeerPartnerAdminUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

export function useDeletePeerPartner() {
  const token = useManagerSessionStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deletePeerPartnerAdminUseCase.execute(token!, id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["admin-peer-partners"] }),
  });
}
