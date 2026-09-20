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
  SectorInviteCodeConflictError,
  SectorNameConflictError,
} from "@/ports/manager-admin.port";
import { UnauthorizedManagerError } from "@/ports/manager-signals.port";
import { apiFetch } from "./api-fetch";


const JSON_HEADERS: HeadersInit = { "Content-Type": "application/json" };

export class HttpManagerAdminAdapter implements ManagerAdminPort {
  async listSectors(): Promise<AdminSector[]> {
    const response = await apiFetch("/manager/admin/sectors");
    if (!response.ok) throw new Error(`list sectors failed with status ${response.status}`);
    return z.array(AdminSectorSchema).parse(await response.json());
  }

  async createSector(
    params: { name: string; inviteCode?: string },
  ): Promise<{ id: string; name: string }> {
    const response = await apiFetch("/manager/admin/sectors", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(params),
    });
    if (response.status === 409) {
      const body = await response.json();
      if (body.conflict === "inviteCode") throw new SectorInviteCodeConflictError();
      throw new SectorNameConflictError();
    }
    if (!response.ok) throw new Error(`create sector failed with status ${response.status}`);
    return response.json();
  }

  async updateSector(id: string, patch: UpdateSectorParams): Promise<void> {
    const response = await apiFetch(`/manager/admin/sectors/${id}`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify(patch),
    });
    if (response.status === 404) throw new ManagerAdminNotFoundError();
    if (response.status === 409) {
      const body = await response.json();
      if (body.conflict === "inviteCode") throw new SectorInviteCodeConflictError();
      throw new SectorNameConflictError();
    }
    if (!response.ok) throw new Error(`update sector failed with status ${response.status}`);
  }

  async listManagers(): Promise<ManagerSummary[]> {
    const response = await apiFetch("/manager/admin/managers");
    if (!response.ok) throw new Error(`list managers failed with status ${response.status}`);
    return z.array(ManagerSummarySchema).parse(await response.json());
  }

  async createManager(params: CreateManagerParams): Promise<CreateManagerResult> {
    const response = await apiFetch("/manager/admin/managers", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(params),
    });
    if (response.status === 400) throw new InvalidManagerAdminRequestError();
    if (!response.ok) throw new Error(`create manager failed with status ${response.status}`);
    return CreateManagerResultSchema.parse(await response.json());
  }

  async updateManager(id: string, patch: UpdateManagerParams): Promise<void> {
    const response = await apiFetch(`/manager/admin/managers/${id}`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify(patch),
    });
    if (response.status === 404) throw new ManagerAdminNotFoundError();
    if (response.status === 409) throw new LastActiveHospitalAdminError();
    if (response.status === 400) throw new InvalidManagerAdminRequestError();
    if (!response.ok) throw new Error(`update manager failed with status ${response.status}`);
  }

  async sendManagerSetPasswordEmail(id: string): Promise<void> {
    const response = await apiFetch(`/manager/admin/managers/${id}/send-set-password-email`, { method: "POST" });
    if (response.status === 404) throw new ManagerAdminNotFoundError();
    if (!response.ok) throw new Error(`send manager set-password email failed with status ${response.status}`);
  }

  async listPeerPartners(): Promise<PeerPartnerSummary[]> {
    const response = await apiFetch("/manager/admin/peer-partners");
    if (!response.ok) throw new Error(`list peer partners failed with status ${response.status}`);
    return z.array(PeerPartnerSummarySchema).parse(await response.json());
  }

  async createPeerPartner(params: CreatePeerPartnerParams): Promise<CreatePeerPartnerResult> {
    const response = await apiFetch("/manager/admin/peer-partners", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify(params),
    });
    if (response.status === 400) throw new InvalidManagerAdminRequestError();
    if (!response.ok) throw new Error(`create peer partner failed with status ${response.status}`);
    return CreatePeerPartnerResultSchema.parse(await response.json());
  }

  async updatePeerPartner(id: string, patch: UpdatePeerPartnerParams): Promise<void> {
    const response = await apiFetch(`/manager/admin/peer-partners/${id}`, {
      method: "PATCH",
      headers: JSON_HEADERS,
      body: JSON.stringify(patch),
    });
    if (response.status === 404) throw new ManagerAdminNotFoundError();
    if (response.status === 409) throw new PeerPartnerEmailConflictError();
    if (!response.ok) throw new Error(`update peer partner failed with status ${response.status}`);
  }

  async sendPeerPartnerSetPasswordEmail(id: string): Promise<void> {
    const response = await apiFetch(`/manager/admin/peer-partners/${id}/send-set-password-email`, { method: "POST" });
    if (response.status === 404) throw new ManagerAdminNotFoundError();
    if (!response.ok) throw new Error(`send peer partner set-password email failed with status ${response.status}`);
  }

  private async deleteResource(path: string): Promise<void> {
    const response = await apiFetch(path, { method: "DELETE" });

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

  async deleteManager(id: string): Promise<void> {
    return this.deleteResource(`/manager/admin/managers/${id}`);
  }

  async deleteSector(id: string): Promise<void> {
    return this.deleteResource(`/manager/admin/sectors/${id}`);
  }

  async deletePeerPartner(id: string): Promise<void> {
    return this.deleteResource(`/manager/admin/peer-partners/${id}`);
  }
}
