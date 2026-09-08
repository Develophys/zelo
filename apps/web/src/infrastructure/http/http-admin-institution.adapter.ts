import type {
  AdminInstitutionPort,
  AdminInstitutionListItem,
  CreateInstitutionParams,
  CreateInstitutionResult,
  UpdateInstitutionParams,
} from "@/ports/admin-institution.port";
import {
  AdminInstitutionListItemSchema,
  AdminInstitutionNotFoundError,
  CreateInstitutionResultSchema,
  DuplicateInstitutionError,
  UnauthorizedAdminError,
} from "@/ports/admin-institution.port";
import { z } from "zod";
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

  async list(token: string): Promise<AdminInstitutionListItem[]> {
    const response = await fetch(`${API_BASE_URL}/admin/institutions`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.status === 401) throw new UnauthorizedAdminError();
    if (!response.ok) throw new Error(`list institutions failed with status ${response.status}`);

    return z.array(AdminInstitutionListItemSchema).parse(await response.json());
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
}
