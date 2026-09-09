import { z } from "zod";
import type {
  AdminInstitutionPort,
  AdminInstitutionPage,
  AdminInstitutionSector,
  CreateInstitutionParams,
  CreateInstitutionResult,
  UpdateInstitutionParams,
} from "@/ports/admin-institution.port";
import {
  AdminInstitutionNotFoundError,
  AdminInstitutionPageSchema,
  AdminInstitutionSectorSchema,
  CreateInstitutionResultSchema,
  DuplicateInstitutionError,
  UnauthorizedAdminError,
} from "@/ports/admin-institution.port";
import { API_BASE_URL } from './api-base-url';


export class HttpAdminInstitutionAdapter implements AdminInstitutionPort {
  async create(token: string, params: CreateInstitutionParams): Promise<CreateInstitutionResult> {
    const response = await fetch(`${API_BASE_URL}/admin/institutions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(params),
    });

    if (response.status === 401) throw new UnauthorizedAdminError();
    if (response.status === 409) throw new DuplicateInstitutionError();
    if (!response.ok) throw new Error(`create institution failed with status ${response.status}`);

    return CreateInstitutionResultSchema.parse(await response.json());
  }

  async list(token: string, query: { cursor?: string | null; limit?: number }): Promise<AdminInstitutionPage> {
    const params = new URLSearchParams();
    if (query.cursor) params.set("cursor", query.cursor);
    if (query.limit !== undefined) params.set("limit", String(query.limit));
    const suffix = params.size > 0 ? `?${params.toString()}` : "";

    const response = await fetch(`${API_BASE_URL}/admin/institutions${suffix}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.status === 401) throw new UnauthorizedAdminError();
    if (!response.ok) throw new Error(`list institutions failed with status ${response.status}`);

    return AdminInstitutionPageSchema.parse(await response.json());
  }

  async update(token: string, id: string, patch: UpdateInstitutionParams): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/admin/institutions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(patch),
    });

    if (response.status === 401) throw new UnauthorizedAdminError();
    if (response.status === 404) throw new AdminInstitutionNotFoundError();
    if (response.status === 409) throw new DuplicateInstitutionError();
    if (!response.ok) throw new Error(`update institution failed with status ${response.status}`);
  }

  async listSectors(token: string, institutionId: string): Promise<AdminInstitutionSector[]> {
    const response = await fetch(`${API_BASE_URL}/admin/institutions/${institutionId}/sectors`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.status === 401) throw new UnauthorizedAdminError();
    if (!response.ok) throw new Error(`list institution sectors failed with status ${response.status}`);

    return z.array(AdminInstitutionSectorSchema).parse(await response.json());
  }
}
