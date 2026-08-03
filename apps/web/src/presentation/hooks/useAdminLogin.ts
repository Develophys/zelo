import { useMutation } from "@tanstack/react-query";
import { loginAdminUseCase } from "@/app/container";
import { useAdminSessionStore } from "@/stores/admin-session.store";

interface LoginVariables {
  email: string;
  password: string;
}

export function useAdminLogin() {
  const setSession = useAdminSessionStore((state) => state.setSession);

  return useMutation({
    mutationFn: ({ email, password }: LoginVariables) => loginAdminUseCase.execute(email, password),
    onSuccess: (result) => {
      setSession(result.token, result.expiresAt);
    },
  });
}
