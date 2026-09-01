import { useQuery } from "@tanstack/react-query";
import { getManagerSignalsUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

export function useManagerSignals(sectorIds?: string[]) {
  const token = useManagerSessionStore((state) => state.token);
  // An empty selection has a knowable answer without asking the server. Kept
  // here rather than at the call site so no caller can forget it and send a
  // request whose result is nothing.
  const nothingSelected = sectorIds?.length === 0;

  return useQuery({
    queryKey: ["manager-signals", token, sectorIds],
    queryFn: () => getManagerSignalsUseCase.execute(token!, sectorIds),
    enabled: token !== null && !nothingSelected,
    // Retrying is pointless (and slows the 401 -> logout redirect) when the
    // token itself is what's rejected; see useApiHealth's precedent of
    // bounding retries for the same reason.
    retry: false,
  });
}
