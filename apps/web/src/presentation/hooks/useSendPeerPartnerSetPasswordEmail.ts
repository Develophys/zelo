import { useMutation, useQueryClient } from "@tanstack/react-query";
import { sendPeerPartnerSetPasswordEmailUseCase } from "@/app/container";

export function useSendPeerPartnerSetPasswordEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => sendPeerPartnerSetPasswordEmailUseCase.execute(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-peer-partners"] });
    },
  });
}
