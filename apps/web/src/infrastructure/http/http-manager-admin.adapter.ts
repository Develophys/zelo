import { z } from "zod";
import type {
  AdminSector,
  CreateManagerParams,
  CreateManagerResult,
  ManagerAdminPort,
  ManagerSummary,
  UpdateManagerParams,
  UpdateSectorParams,
} from "@/ports/manager-admin.port";
import {
  AdminSectorSchema,
  CreateManagerResultSchema,
  InvalidManagerAdminRequestError,
  LastActiveHospitalAdminError,
  ManagerAdminNotFoundError,
  ManagerSummarySchema,
  ResetPasswordResultSchema,
  SectorNameConflictError,
} from "@/ports/manager-admin.port";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

function authHeaders(token: string): HeadersInit {
  return { "Content-Type": "application/json", Authorization: `Bearer ${token}` };
}

export class HttpManagerAdminAdapter implements ManagerAdminPort {
  async listSectors(token: string): Promise<AdminSector[]> {
    const response = await fetch(`${API_BASE_URL}/manager/admin/sectors`, { headers: authHeaders(token) });
    if (!response.ok) throw new Error(`list sectors failed with status ${response.status}`);
    return z.array(AdminSectorSchema).parse(await response.json());
  }

  async createSector(token: string, name: string): Promise<{ id: string; name: string }> {
    const response = await fetch(`${API_BASE_URL}/manager/admin/sectors`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify({ name }),
    });
    if (response.status === 409) throw new SectorNameConflictError();
    if (!response.ok) throw new Error(`create sector failed with status ${response.status}`);
    return response.json();
  }

  async updateSector(token: string, id: string, patch: UpdateSectorParams): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/manager/admin/sectors/${id}`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(patch),
    });
    if (response.status === 404) throw new ManagerAdminNotFoundError();
    if (!response.ok) throw new Error(`update sector failed with status ${response.status}`);
  }

  async listManagers(token: string): Promise<ManagerSummary[]> {
    const response = await fetch(`${API_BASE_URL}/manager/admin/managers`, { headers: authHeaders(token) });
    if (!response.ok) throw new Error(`list managers failed with status ${response.status}`);
    return z.array(ManagerSummarySchema).parse(await response.json());
  }

  async createManager(token: string, params: CreateManagerParams): Promise<CreateManagerResult> {
    const response = await fetch(`${API_BASE_URL}/manager/admin/managers`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(params),
    });
    if (response.status === 400) throw new InvalidManagerAdminRequestError();
    if (!response.ok) throw new Error(`create manager failed with status ${response.status}`);
    return CreateManagerResultSchema.parse(await response.json());
  }

  async updateManager(token: string, id: string, patch: UpdateManagerParams): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/manager/admin/managers/${id}`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(patch),
    });
    if (response.status === 404) throw new ManagerAdminNotFoundError();
    if (response.status === 409) throw new LastActiveHospitalAdminError();
    if (response.status === 400) throw new InvalidManagerAdminRequestError();
    if (!response.ok) throw new Error(`update manager failed with status ${response.status}`);
  }

  async resetManagerPassword(token: string, id: string): Promise<{ temporaryPassword: string }> {
    const response = await fetch(`${API_BASE_URL}/manager/admin/managers/${id}/reset-password`, {
      method: "POST",
      headers: authHeaders(token),
    });
    if (response.status === 404) throw new ManagerAdminNotFoundError();
    if (!response.ok) throw new Error(`reset manager password failed with status ${response.status}`);
    return ResetPasswordResultSchema.parse(await response.json());
  }
}
