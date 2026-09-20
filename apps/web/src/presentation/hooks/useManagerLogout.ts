import { useMutation, useQueryClient } from "@tanstack/react-query";
import { logoutManagerUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

export function useManagerLogout() {
  const clearSession = useManagerSessionStore((state) => state.clearSession);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => logoutManagerUseCase.execute(),
    onSettled: () => {
      clearSession();
      queryClient.clear();
    },
  });
}
