import { MutationCache, QueryClient } from "@tanstack/react-query";
import { toast } from "@/stores/toast.store";

const MUTATION_FAILED = "Não foi possível concluir a ação. Tente de novo.";

/**
 * Error handling used to be declared per call site and reached two of eighteen
 * of them, so most admin writes failed in complete silence: the spinner
 * stopped, the modal stayed open with the fields filled, and the only
 * reasonable next move was to press the button again.
 *
 * The cache-level `onError` is a floor, not a ceiling — react-query still runs
 * a mutation's own `onError` when it has one, so a call site with specific copy
 * keeps it and everything else stops failing quietly.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    mutationCache: new MutationCache({
      onError: (_error, _variables, _context, mutation) => {
        if (mutation.options.onError) return;
        toast.error(MUTATION_FAILED);
      },
    }),
  });
}
