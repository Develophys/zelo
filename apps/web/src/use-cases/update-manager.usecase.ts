import type { ManagerAdminPort, UpdateManagerParams } from "@/ports/manager-admin.port";

export class UpdateManagerUseCase {
  constructor(private readonly port: ManagerAdminPort) {}
  async execute(token: string, id: string, patch: UpdateManagerParams): Promise<void> {
    return this.port.updateManager(token, id, patch);
  }
}
