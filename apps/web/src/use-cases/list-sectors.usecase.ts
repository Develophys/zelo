import type { AdminSector, ManagerAdminPort } from "@/ports/manager-admin.port";

export class ListSectorsUseCase {
  constructor(private readonly port: ManagerAdminPort) {}
  async execute(): Promise<AdminSector[]> {
    return this.port.listSectors();
  }
}
