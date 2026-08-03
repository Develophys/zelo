import type { AdminAuthPort, AdminLoginResult } from "@/ports/admin-auth.port";

export class LoginAdminUseCase {
  constructor(private readonly authPort: AdminAuthPort) {}

  async execute(email: string, password: string): Promise<AdminLoginResult> {
    return this.authPort.login(email, password);
  }
}
