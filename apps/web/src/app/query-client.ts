import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";
import { toast } from "@/stores/toast.store";
import { sessionRoleOfError, type SessionRole } from "./session-expiry";

const MUTATION_FAILED = "Não foi possível concluir a ação. Tente de novo.";

interface CreateQueryClientOptions {
  onSessionExpired?: (role: SessionRole) => void;
}

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
export function createQueryClient({ onSessionExpired }: CreateQueryClientOptions = {}): QueryClient {
  return new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        const role = sessionRoleOfError(error);
        if (role) onSessionExpired?.(role);
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        const role = sessionRoleOfError(error);
        if (role) {
          onSessionExpired?.(role);
          return;
        }
        if (mutation.options.onError) return;
        toast.error(MUTATION_FAILED);
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: (failureCount, error) => sessionRoleOfError(error) === null && failureCount < 3,
      },
    },
  });
}
