export interface AdminInstitutionRow {
  id: string;
  name: string;
  inviteCode: string;
  createdAt: Date;
  hospitalAdminNames: string[];
}

export interface CreateInstitutionParams {
  institutionName: string;
  inviteCode: string;
  hospitalAdminName: string;
  hospitalAdminPasswordHash: string;
}

export interface AdminInstitutionRepository {
  createWithHospitalAdmin(
    params: CreateInstitutionParams,
  ): Promise<{ institution: { id: string; name: string; inviteCode: string }; hospitalAdmin: { id: string; name: string } }>;
  findAll(): Promise<AdminInstitutionRow[]>;
}

export const ADMIN_INSTITUTION_REPOSITORY = Symbol("ADMIN_INSTITUTION_REPOSITORY");

// Thrown on a unique-constraint violation on institution name/inviteCode or manager name.
export class DuplicateInstitutionOrManagerError extends Error {}
