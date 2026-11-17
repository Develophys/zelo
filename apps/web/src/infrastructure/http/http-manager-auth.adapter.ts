import type { ManagerAuthPort, ManagerLoginResult, ManagerProfile } from "@/ports/manager-auth.port";
import { ManagerLoginResultSchema, InvalidManagerCredentialsError, InvalidOrExpiredManagerSetupTokenError } from "@/ports/manager-auth.port";
import { UnauthorizedManagerError } from "@/ports/manager-signals.port";
import { API_BASE_URL } from './api-base-url';
import { apiFetch } from "./api-fetch";


export class HttpManagerAuthAdapter implements ManagerAuthPort {
  async login(email: string, password: string): Promise<ManagerLoginResult> {
    const response = await apiFetch("/manager/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (response.status === 401) {
      throw new InvalidManagerCredentialsError();
    }
    if (!response.ok) {
      throw new Error(`manager login failed with status ${response.status}`);
    }

    return ManagerLoginResultSchema.parse(await response.json());
  }

  async me(): Promise<ManagerProfile> {
    const response = await apiFetch("/manager/me");

    if (response.status === 401) {
      throw new UnauthorizedManagerError();
    }
    if (!response.ok) {
      throw new Error(`manager me failed with status ${response.status}`);
    }

    return ManagerLoginResultSchema.parse(await response.json());
  }

  async logout(): Promise<void> {
    const response = await apiFetch("/manager/logout", { method: "POST" });

    if (!response.ok) {
      throw new Error(`manager logout failed with status ${response.status}`);
    }
  }

  async finishSetup(token: string, password: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/manager/finish-setup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password }),
    });

    if (response.status === 401) {
      throw new InvalidOrExpiredManagerSetupTokenError();
    }
    if (!response.ok) {
      throw new Error(`manager finish-setup failed with status ${response.status}`);
    }
  }

  async requestPasswordReset(email: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/manager/forgot-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    if (!response.ok) {
      throw new Error(`manager forgot-password failed with status ${response.status}`);
    }
  }
}
