import type { ManagerAuthPort, ManagerProfile } from "@/ports/manager-auth.port";

export class GetManagerSessionUseCase {
  constructor(private readonly authPort: ManagerAuthPort) {}

  async execute(): Promise<ManagerProfile> {
    return this.authPort.me();
  }
}
