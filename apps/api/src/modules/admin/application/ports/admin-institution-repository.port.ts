export interface AdminInstitutionRow {
  id: string;
  name: string;
  inviteCode: string;
  isActive: boolean;
  createdAt: Date;
  hospitalAdminNames: string[];
}

export interface CreateInstitutionParams {
  institutionName: string;
  inviteCode: string;
  hospitalAdminName: string;
  hospitalAdminEmail: string;
  setPasswordToken: string;
  setPasswordTokenExpiresAt: Date;
}

// Invite code is deliberately not editable here: it's the string médicos and
// printed QR codes already carry, and changing it would silently break
// whatever a hospital already handed out.
export interface UpdateInstitutionParams {
  name?: string;
  isActive?: boolean;
}

export interface AdminInstitutionPage {
  items: AdminInstitutionRow[];
  nextCursor: string | null;
  total: number | null;
}

export interface AdminInstitutionRepository {
  createWithHospitalAdmin(
    params: CreateInstitutionParams,
  ): Promise<{ institution: { id: string; name: string; inviteCode: string }; hospitalAdmin: { id: string; name: string; email: string } }>;
  findPage(query: { cursor: string | null; limit: number }): Promise<AdminInstitutionPage>;
  findById(id: string): Promise<AdminInstitutionRow | null>;
  update(id: string, patch: UpdateInstitutionParams): Promise<void>;
}

export const ADMIN_INSTITUTION_REPOSITORY = Symbol("ADMIN_INSTITUTION_REPOSITORY");

// Thrown on a unique-constraint violation on institution name/inviteCode or manager email.
export class DuplicateInstitutionOrManagerError extends Error {}
