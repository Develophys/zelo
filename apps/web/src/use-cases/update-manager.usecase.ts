import type { ManagerAdminPort, UpdateManagerParams } from "@/ports/manager-admin.port";

export class UpdateManagerUseCase {
  constructor(private readonly port: ManagerAdminPort) {}
  async execute(id: string, patch: UpdateManagerParams): Promise<void> {
    return this.port.updateManager(id, patch);
  }
}
