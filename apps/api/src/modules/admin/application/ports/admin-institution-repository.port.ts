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
  hospitalAdminEmail: string;
  setPasswordToken: string;
  setPasswordTokenExpiresAt: Date;
}

export interface AdminInstitutionRepository {
  createWithHospitalAdmin(
    params: CreateInstitutionParams,
  ): Promise<{ institution: { id: string; name: string; inviteCode: string }; hospitalAdmin: { id: string; name: string; email: string } }>;
  findAll(): Promise<AdminInstitutionRow[]>;
}

export const ADMIN_INSTITUTION_REPOSITORY = Symbol("ADMIN_INSTITUTION_REPOSITORY");

// Thrown on a unique-constraint violation on institution name/inviteCode or manager email.
export class DuplicateInstitutionOrManagerError extends Error {}
