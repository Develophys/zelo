export type ManagerRole = "HOSPITAL_ADMIN" | "SECTOR_MANAGER";

export interface ManagerRow {
  id: string;
  name: string;
  email: string;
  passwordHash: string | null;
  setPasswordTokenExpiresAt: Date | null;
  institutionId: string;
  role: ManagerRole;
  isActive: boolean;
}

export interface ManagerSummaryRow {
  id: string;
  name: string;
  email: string;
  role: ManagerRole;
  isActive: boolean;
  sectorNames: string[];
  hasPassword: boolean;
  setPasswordTokenExpiresAt: string | null;
}

export interface CreateManagerParams {
  name: string;
  email: string;
  institutionId: string;
  role: ManagerRole;
  setPasswordToken: string;
  setPasswordTokenExpiresAt: Date;
}

export interface UpdateManagerParams {
  isActive?: boolean;
  role?: ManagerRole;
  passwordHash?: string | null;
  setPasswordToken?: string | null;
  setPasswordTokenExpiresAt?: Date | null;
}

export interface ManagerRepository {
  findByEmail(email: string): Promise<ManagerRow | null>;
  findBySetPasswordToken(token: string): Promise<ManagerRow | null>;
  findById(id: string): Promise<ManagerRow | null>;
  findAllByInstitution(institutionId: string): Promise<ManagerSummaryRow[]>;
  create(params: CreateManagerParams): Promise<{ id: string; name: string; email: string }>;
  update(id: string, patch: UpdateManagerParams): Promise<void>;
  countActiveHospitalAdmins(institutionId: string): Promise<number>;
  findActiveHospitalAdminIds(institutionId: string): Promise<string[]>;
  findLapsedInvites(
    now: Date,
  ): Promise<{ id: string; name: string; institutionId: string; setPasswordTokenExpiresAt: Date }[]>;
  delete(id: string): Promise<void>;
}

export const MANAGER_REPOSITORY = Symbol("MANAGER_REPOSITORY");
