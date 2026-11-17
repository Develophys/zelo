import type { CreatePeerPartnerParams, CreatePeerPartnerResult, ManagerAdminPort } from "@/ports/manager-admin.port";

export class CreatePeerPartnerUseCase {
  constructor(private readonly port: ManagerAdminPort) {}
  async execute(params: CreatePeerPartnerParams): Promise<CreatePeerPartnerResult> {
    return this.port.createPeerPartner(params);
  }
}
