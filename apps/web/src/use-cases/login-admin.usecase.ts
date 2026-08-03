import type { AdminAuthPort, AdminLoginResult } from "@/ports/admin-auth.port";

export class LoginAdminUseCase {
  constructor(private readonly adminAuthPort: AdminAuthPort) {}

  async execute(name: string, password: string): Promise<AdminLoginResult> {
    return this.adminAuthPort.login(name, password);
  }
}
