import { useMutation } from "@tanstack/react-query";
import { loginManagerUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

interface LoginVariables {
  email: string;
  password: string;
}

export function useManagerLogin() {
  const setSession = useManagerSessionStore((state) => state.setSession);

  return useMutation({
    mutationFn: ({ email, password }: LoginVariables) => loginManagerUseCase.execute(email, password),
    onSuccess: (result) => {
      setSession(result.token, result.expiresAt, result.role);
    },
  });
}
