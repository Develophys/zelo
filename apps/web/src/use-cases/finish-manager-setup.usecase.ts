import type { ManagerAuthPort } from "@/ports/manager-auth.port";

export class FinishManagerSetupUseCase {
  constructor(private readonly authPort: ManagerAuthPort) {}

  async execute(token: string, password: string): Promise<void> {
    return this.authPort.finishSetup(token, password);
  }
}
