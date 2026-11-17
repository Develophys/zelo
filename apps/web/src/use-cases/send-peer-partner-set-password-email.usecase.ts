import type { ManagerAdminPort } from "@/ports/manager-admin.port";

export class SendPeerPartnerSetPasswordEmailUseCase {
  constructor(private readonly port: ManagerAdminPort) {}
  async execute(id: string): Promise<void> {
    return this.port.sendPeerPartnerSetPasswordEmail(id);
  }
}
