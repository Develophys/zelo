import { useMutation, useQueryClient } from "@tanstack/react-query";
import { sendManagerSetPasswordEmailUseCase } from "@/app/container";

export function useSendManagerSetPasswordEmail() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => sendManagerSetPasswordEmailUseCase.execute(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-managers"] });
    },
  });
}
