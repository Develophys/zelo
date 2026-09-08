import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { getManagerSignalsUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

export function useManagerSignals(sectorIds?: string[]) {
  const token = useManagerSessionStore((state) => state.token);

  return useQuery({
    queryKey: ["manager-signals", token, sectorIds],
    queryFn: () => getManagerSignalsUseCase.execute(token!, sectorIds),
    enabled: token !== null,
    // Retrying is pointless (and slows the 401 -> logout redirect) when the
    // token itself is what's rejected.
    retry: false,
    // The aggregation (k-anonymity suppression, reference-week selection) has
    // to stay server-side — it can't be recomputed from cached data without
    // shipping raw per-sector counts the suppression exists to hide. Toggling
    // the sector filter would otherwise blank the dashboard back to a
    // skeleton on every click; keeping the last result on screen during the
    // refetch is what actually removes the jank, not skipping the request.
    placeholderData: keepPreviousData,
  });
}
