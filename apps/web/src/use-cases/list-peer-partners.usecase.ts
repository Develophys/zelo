import type { ManagerAdminPort, PeerPartnerSummary } from "@/ports/manager-admin.port";

export class ListPeerPartnersUseCase {
  constructor(private readonly port: ManagerAdminPort) {}
  async execute(): Promise<PeerPartnerSummary[]> {
    return this.port.listPeerPartners();
  }
}
