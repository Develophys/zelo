import type { ManagerAuthPort } from "@/ports/manager-auth.port";

export class RequestManagerPasswordResetUseCase {
  constructor(private readonly authPort: ManagerAuthPort) {}

  async execute(email: string): Promise<void> {
    return this.authPort.requestPasswordReset(email);
  }
}
