export type ManagerRole = "HOSPITAL_ADMIN" | "SECTOR_MANAGER";

export interface ManagerRow {
  id: string;
  name: string;
  passwordHash: string;
  institutionId: string;
  role: ManagerRole;
  isActive: boolean;
}

export interface ManagerSummaryRow {
  id: string;
  name: string;
  role: ManagerRole;
  isActive: boolean;
  sectorNames: string[];
}

export interface CreateManagerParams {
  name: string;
  passwordHash: string;
  institutionId: string;
  role: ManagerRole;
}

export interface UpdateManagerParams {
  isActive?: boolean;
  role?: ManagerRole;
  passwordHash?: string;
}

export interface ManagerRepository {
  findByName(name: string): Promise<ManagerRow | null>;
  findById(id: string): Promise<ManagerRow | null>;
  findAllByInstitution(institutionId: string): Promise<ManagerSummaryRow[]>;
  create(params: CreateManagerParams): Promise<{ id: string; name: string }>;
  update(id: string, patch: UpdateManagerParams): Promise<void>;
  countActiveHospitalAdmins(institutionId: string): Promise<number>;
}

export const MANAGER_REPOSITORY = Symbol("MANAGER_REPOSITORY");
