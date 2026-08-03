import type { ManagerAdminPort } from "@/ports/manager-admin.port";

export class CreateSectorUseCase {
  constructor(private readonly port: ManagerAdminPort) {}
  async execute(token: string, name: string): Promise<{ id: string; name: string }> {
    return this.port.createSector(token, name);
  }
}
