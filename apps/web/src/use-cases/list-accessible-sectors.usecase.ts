import type { AccessibleSector, ManagerSectorsPort } from "@/ports/manager-sectors.port";

export class ListAccessibleSectorsUseCase {
  constructor(private readonly port: ManagerSectorsPort) {}
  async execute(token: string): Promise<AccessibleSector[]> {
    return this.port.listAccessible(token);
  }
}
