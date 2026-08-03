import { useQuery } from "@tanstack/react-query";
import { listPeerPartnersUseCase } from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

export function useAdminPeerPartners() {
  const token = useManagerSessionStore((state) => state.token);
  return useQuery({
    queryKey: ["admin-peer-partners", token],
    queryFn: () => listPeerPartnersUseCase.execute(token!),
    enabled: token !== null,
  });
}
