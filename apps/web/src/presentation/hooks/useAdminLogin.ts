import { useMutation } from "@tanstack/react-query";
import { loginAdminUseCase } from "@/app/container";
import { useAdminSessionStore } from "@/stores/admin-session.store";

interface LoginVariables {
  name: string;
  password: string;
}

export function useAdminLogin() {
  const setSession = useAdminSessionStore((state) => state.setSession);

  return useMutation({
    mutationFn: ({ name, password }: LoginVariables) => loginAdminUseCase.execute(name, password),
    onSuccess: (result) => {
      setSession(result.token, result.expiresAt);
    },
  });
}
