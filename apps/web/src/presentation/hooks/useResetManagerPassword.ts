import { useMutation } from "@tanstack/react-query";
import { resetManagerPasswordUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

export function useResetManagerPassword() {
  const token = useManagerSessionStore((state) => state.token);
  return useMutation({
    mutationFn: (id: string) => resetManagerPasswordUseCase.execute(token!, id),
  });
}
