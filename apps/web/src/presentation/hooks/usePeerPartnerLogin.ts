import { useMutation } from "@tanstack/react-query";
import { loginPeerPartnerUseCase } from "@/app/container";
import { usePeerPartnerSessionStore } from "@/stores/peer-partner-session.store";

interface LoginVariables {
  email: string;
  password: string;
}

export function usePeerPartnerLogin() {
  const setSession = usePeerPartnerSessionStore((state) => state.setSession);

  return useMutation({
    mutationFn: ({ email, password }: LoginVariables) => loginPeerPartnerUseCase.execute(email, password),
    onSuccess: (result) => {
      setSession(result.token, result.expiresAt);
    },
  });
}
