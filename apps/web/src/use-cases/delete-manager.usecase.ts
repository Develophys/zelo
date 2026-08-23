import type { ManagerAdminPort } from "@/ports/manager-admin.port";

export class DeleteManagerUseCase {
  constructor(private readonly port: ManagerAdminPort) {}

  async execute(token: string, id: string): Promise<void> {
    return this.port.deleteManager(token, id);
  }
}
