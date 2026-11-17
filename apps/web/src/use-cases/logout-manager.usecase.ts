import type { ManagerAuthPort } from "@/ports/manager-auth.port";

export class LogoutManagerUseCase {
  constructor(private readonly authPort: ManagerAuthPort) {}

  async execute(): Promise<void> {
    return this.authPort.logout();
  }
}
