import { useMutation } from "@tanstack/react-query";
import { resetPeerPartnerPasswordUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

export function useResetPeerPartnerPassword() {
  const token = useManagerSessionStore((state) => state.token);
  return useMutation({
    mutationFn: (id: string) => resetPeerPartnerPasswordUseCase.execute(token!, id),
  });
}
