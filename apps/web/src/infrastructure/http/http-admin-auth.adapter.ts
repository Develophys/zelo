import type { AdminAuthPort, AdminLoginResult } from "@/ports/admin-auth.port";
import { AdminLoginResultSchema, InvalidAdminCredentialsError } from "@/ports/admin-auth.port";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export class HttpAdminAuthAdapter implements AdminAuthPort {
  async login(name: string, password: string): Promise<AdminLoginResult> {
    const response = await fetch(`${API_BASE_URL}/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, password }),
    });

    if (response.status === 401) {
      throw new InvalidAdminCredentialsError();
    }
    if (!response.ok) {
      throw new Error(`admin login failed with status ${response.status}`);
    }

    return AdminLoginResultSchema.parse(await response.json());
  }
}
