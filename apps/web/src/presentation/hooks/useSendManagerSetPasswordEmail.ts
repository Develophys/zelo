import { useMutation } from "@tanstack/react-query";
import { sendManagerSetPasswordEmailUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

export function useSendManagerSetPasswordEmail() {
  const token = useManagerSessionStore((state) => state.token);
  return useMutation({
    mutationFn: (id: string) => sendManagerSetPasswordEmailUseCase.execute(token!, id),
  });
}
