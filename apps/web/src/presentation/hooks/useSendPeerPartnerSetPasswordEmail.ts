import { useMutation } from "@tanstack/react-query";
import { sendPeerPartnerSetPasswordEmailUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

export function useSendPeerPartnerSetPasswordEmail() {
  const token = useManagerSessionStore((state) => state.token);
  return useMutation({
    mutationFn: (id: string) => sendPeerPartnerSetPasswordEmailUseCase.execute(token!, id),
  });
}
