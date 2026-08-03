import type { ManagerAdminPort, UpdatePeerPartnerParams } from "@/ports/manager-admin.port";

export class UpdatePeerPartnerUseCase {
  constructor(private readonly port: ManagerAdminPort) {}
  async execute(token: string, id: string, patch: UpdatePeerPartnerParams): Promise<void> {
    return this.port.updatePeerPartner(token, id, patch);
  }
}
