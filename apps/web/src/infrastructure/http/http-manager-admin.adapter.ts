import { z } from "zod";
import type {
  AdminDeleteConflictReason,
  AdminSector,
  CreateManagerParams,
  CreateManagerResult,
  CreatePeerPartnerParams,
  CreatePeerPartnerResult,
  ManagerAdminPort,
  ManagerSummary,
  PeerPartnerSummary,
  UpdateManagerParams,
  UpdatePeerPartnerParams,
  UpdateSectorParams,
} from "@/ports/manager-admin.port";
import {
  AdminDeleteConflictError,
  AdminSectorSchema,
  CreateManagerResultSchema,
  CreatePeerPartnerResultSchema,
  InvalidManagerAdminRequestError,
  LastActiveHospitalAdminError,
  ManagerAdminNotFoundError,
  ManagerSummarySchema,
  PeerPartnerEmailConflictError,
  PeerPartnerSummarySchema,
  SectorNameConflictError,
} from "@/ports/manager-admin.port";
import { UnauthorizedManagerError } from "@/ports/manager-signals.port";

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

  async sendManagerSetPasswordEmail(token: string, id: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/manager/admin/managers/${id}/send-set-password-email`, {
      method: "POST",
      headers: authHeaders(token),
    });
    if (response.status === 404) throw new ManagerAdminNotFoundError();
    if (!response.ok) throw new Error(`send manager set-password email failed with status ${response.status}`);
  }

  async listPeerPartners(token: string): Promise<PeerPartnerSummary[]> {
    const response = await fetch(`${API_BASE_URL}/manager/admin/peer-partners`, { headers: authHeaders(token) });
    if (!response.ok) throw new Error(`list peer partners failed with status ${response.status}`);
    return z.array(PeerPartnerSummarySchema).parse(await response.json());
  }

  async createPeerPartner(token: string, params: CreatePeerPartnerParams): Promise<CreatePeerPartnerResult> {
    const response = await fetch(`${API_BASE_URL}/manager/admin/peer-partners`, {
      method: "POST",
      headers: authHeaders(token),
      body: JSON.stringify(params),
    });
    if (response.status === 400) throw new InvalidManagerAdminRequestError();
    if (!response.ok) throw new Error(`create peer partner failed with status ${response.status}`);
    return CreatePeerPartnerResultSchema.parse(await response.json());
  }

  async updatePeerPartner(token: string, id: string, patch: UpdatePeerPartnerParams): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/manager/admin/peer-partners/${id}`, {
      method: "PATCH",
      headers: authHeaders(token),
      body: JSON.stringify(patch),
    });
    if (response.status === 404) throw new ManagerAdminNotFoundError();
    if (response.status === 409) throw new PeerPartnerEmailConflictError();
    if (!response.ok) throw new Error(`update peer partner failed with status ${response.status}`);
  }

  async sendPeerPartnerSetPasswordEmail(token: string, id: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/manager/admin/peer-partners/${id}/send-set-password-email`, {
      method: "POST",
      headers: authHeaders(token),
    });
    if (response.status === 404) throw new ManagerAdminNotFoundError();
    if (!response.ok) throw new Error(`send peer partner set-password email failed with status ${response.status}`);
  }

  private async deleteResource(token: string, path: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}${path}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.status === 401) throw new UnauthorizedManagerError();
    if (response.status === 409) {
      const body = (await response.json().catch(() => null)) as { message?: unknown } | null;
      const raw = typeof body?.message === "string" ? body.message : "";
      const reason: AdminDeleteConflictReason =
        raw === "MANAGER_OWNS_SECTORS" || raw === "LAST_ADMIN" || raw === "SECTOR_HAS_HISTORY"
          ? raw
          : "UNKNOWN";
      throw new AdminDeleteConflictError(reason);
    }
    if (!response.ok) throw new Error(`delete failed with status ${response.status}`);
  }

  async deleteManager(token: string, id: string): Promise<void> {
    return this.deleteResource(token, `/manager/admin/managers/${id}`);
  }

  async deleteSector(token: string, id: string): Promise<void> {
    return this.deleteResource(token, `/manager/admin/sectors/${id}`);
  }

  async deletePeerPartner(token: string, id: string): Promise<void> {
    return this.deleteResource(token, `/manager/admin/peer-partners/${id}`);
  }
}
