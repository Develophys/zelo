import type { ManagerAdminPort, ManagerSummary } from "@/ports/manager-admin.port";

export class ListManagersUseCase {
  constructor(private readonly port: ManagerAdminPort) {}
  async execute(token: string): Promise<ManagerSummary[]> {
    return this.port.listManagers(token);
  }
}
