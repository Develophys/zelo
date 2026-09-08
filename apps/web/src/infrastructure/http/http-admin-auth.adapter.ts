import type { AdminAuthPort, AdminLoginResult } from "@/ports/admin-auth.port";
import { AdminLoginResultSchema, InvalidAdminCredentialsError } from "@/ports/admin-auth.port";
import { API_BASE_URL } from './api-base-url';


export class HttpAdminAuthAdapter implements AdminAuthPort {
  async login(email: string, password: string): Promise<AdminLoginResult> {
    const response = await fetch(`${API_BASE_URL}/admin/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
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
