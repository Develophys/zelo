import { useMutation } from "@tanstack/react-query";
import { loginPeerPartnerUseCase } from "@/app/container";
import { usePeerPartnerSessionStore } from "@/stores/peer-partner-session.store";

interface LoginVariables {
  name: string;
  password: string;
}

export function usePeerPartnerLogin() {
  const setSession = usePeerPartnerSessionStore((state) => state.setSession);

  return useMutation({
    mutationFn: ({ name, password }: LoginVariables) => loginPeerPartnerUseCase.execute(name, password),
    onSuccess: (result) => {
      setSession(result.token, result.expiresAt);
    },
  });
}
