import type { ManagerAdminPort } from "@/ports/manager-admin.port";

export class DeleteManagerUseCase {
  constructor(private readonly port: ManagerAdminPort) {}

  async execute(id: string): Promise<void> {
    return this.port.deleteManager(id);
  }
}
