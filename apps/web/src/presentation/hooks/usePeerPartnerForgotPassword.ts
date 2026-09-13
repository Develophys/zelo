import { useMutation } from "@tanstack/react-query";
import { requestPeerPartnerPasswordResetUseCase } from "@/app/container";

export function usePeerPartnerForgotPassword() {
  return useMutation({
    mutationFn: (email: string) => requestPeerPartnerPasswordResetUseCase.execute(email),
  });
}
