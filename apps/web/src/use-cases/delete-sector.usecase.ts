import type { ManagerAdminPort } from "@/ports/manager-admin.port";

export class DeleteSectorUseCase {
  constructor(private readonly port: ManagerAdminPort) {}

  async execute(token: string, id: string): Promise<void> {
    return this.port.deleteSector(token, id);
  }
}
