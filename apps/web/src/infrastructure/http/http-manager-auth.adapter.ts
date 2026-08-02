import type { ManagerAuthPort, ManagerLoginResult } from "@/ports/manager-auth.port";
import { ManagerLoginResultSchema, InvalidManagerCredentialsError } from "@/ports/manager-auth.port";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

export class HttpManagerAuthAdapter implements ManagerAuthPort {
  async login(name: string, password: string): Promise<ManagerLoginResult> {
    const response = await fetch(`${API_BASE_URL}/manager/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, password }),
    });

    if (response.status === 401) {
      throw new InvalidManagerCredentialsError();
    }
    if (!response.ok) {
      throw new Error(`manager login failed with status ${response.status}`);
    }

    return ManagerLoginResultSchema.parse(await response.json());
  }
}
