import { useQuery } from "@tanstack/react-query";
import { listPeerPartnersUseCase } from "@/app/container";

export function useAdminPeerPartners() {
  return useQuery({
    queryKey: ["admin-peer-partners"],
    queryFn: () => listPeerPartnersUseCase.execute(),
  });
}
