import { useMutation, useQueryClient } from "@tanstack/react-query";
import { generateManagerInsightUseCase } from "@/app/container";

export function useManagerInsight() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => generateManagerInsightUseCase.execute(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["manager-insight-history"] });
    },
  });
}
