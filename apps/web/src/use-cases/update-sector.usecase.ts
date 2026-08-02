import type { ManagerAdminPort, UpdateSectorParams } from "@/ports/manager-admin.port";

export class UpdateSectorUseCase {
  constructor(private readonly port: ManagerAdminPort) {}
  async execute(token: string, id: string, patch: UpdateSectorParams): Promise<void> {
    return this.port.updateSector(token, id, patch);
  }
}
