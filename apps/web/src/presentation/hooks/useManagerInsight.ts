import { useMutation, useQueryClient } from "@tanstack/react-query";
import { generateManagerInsightUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

export function useManagerInsight() {
  const token = useManagerSessionStore((state) => state.token);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => generateManagerInsightUseCase.execute(token!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["manager-insight-history", token] });
    },
  });
}
