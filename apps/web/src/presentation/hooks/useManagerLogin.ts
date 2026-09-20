import { useMutation, useQueryClient } from "@tanstack/react-query";
import { loginManagerUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

interface LoginVariables {
  email: string;
  password: string;
}

export function useManagerLogin() {
  const setSession = useManagerSessionStore((state) => state.setSession);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ email, password }: LoginVariables) => loginManagerUseCase.execute(email, password),
    onSuccess: (result) => {
      queryClient.clear();
      setSession(result.role, result.name);
    },
  });
}
