import type { CreateManagerParams, CreateManagerResult, ManagerAdminPort } from "@/ports/manager-admin.port";

export class CreateManagerUseCase {
  constructor(private readonly port: ManagerAdminPort) {}
  async execute(token: string, params: CreateManagerParams): Promise<CreateManagerResult> {
    return this.port.createManager(token, params);
  }
}
