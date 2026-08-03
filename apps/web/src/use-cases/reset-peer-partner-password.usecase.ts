import type { ManagerAdminPort } from "@/ports/manager-admin.port";

export class ResetPeerPartnerPasswordUseCase {
  constructor(private readonly port: ManagerAdminPort) {}
  async execute(token: string, id: string): Promise<{ temporaryPassword: string }> {
    return this.port.resetPeerPartnerPassword(token, id);
  }
}
