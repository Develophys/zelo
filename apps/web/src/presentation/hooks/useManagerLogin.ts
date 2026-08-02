import { useMutation } from "@tanstack/react-query";
import { loginManagerUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

interface LoginVariables {
  name: string;
  password: string;
}

export function useManagerLogin() {
  const setSession = useManagerSessionStore((state) => state.setSession);

  return useMutation({
    mutationFn: ({ name, password }: LoginVariables) => loginManagerUseCase.execute(name, password),
    onSuccess: (result) => {
      setSession(result.token, result.expiresAt, result.role);
    },
  });
}
