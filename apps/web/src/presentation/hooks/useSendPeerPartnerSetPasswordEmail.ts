import { useMutation, useQueryClient } from "@tanstack/react-query";
import { sendPeerPartnerSetPasswordEmailUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

export function useSendPeerPartnerSetPasswordEmail() {
  const token = useManagerSessionStore((state) => state.token);
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => sendPeerPartnerSetPasswordEmailUseCase.execute(token!, id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-peer-partners"] });
    },
  });
}
