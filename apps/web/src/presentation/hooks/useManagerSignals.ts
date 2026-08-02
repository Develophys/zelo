import { useQuery } from "@tanstack/react-query";
import { getManagerSignalsUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

export function useManagerSignals(sectorIds?: string[]) {
  const token = useManagerSessionStore((state) => state.token);

  return useQuery({
    queryKey: ["manager-signals", token, sectorIds],
    queryFn: () => getManagerSignalsUseCase.execute(token!, sectorIds),
    enabled: token !== null,
    // Retrying is pointless (and slows the 401 -> logout redirect) when the
    // token itself is what's rejected; see useApiHealth's precedent of
    // bounding retries for the same reason.
    retry: false,
  });
}
