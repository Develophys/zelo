import type { ManagerAdminPort } from "@/ports/manager-admin.port";

export class DeletePeerPartnerUseCase {
  constructor(private readonly port: ManagerAdminPort) {}

  async execute(id: string): Promise<void> {
    return this.port.deletePeerPartner(id);
  }
}
