export interface AdminSectorRow {
  id: string;
  name: string;
  isActive: boolean;
  managerId: string | null;
  managerName: string | null;
  inviteCode: string | null;
}

export interface SectorWithInstitution {
  id: string;
  name: string;
  isActive: boolean;
  institution: { id: string; name: string; isActive: boolean };
}

export interface UpdateSectorParams {
  isActive?: boolean;
  managerId?: string | null;
  inviteCode?: string;
}

export interface SectorRepository {
  create(institutionId: string, name: string, inviteCode?: string): Promise<{ id: string; name: string }>;
  findAllForAdmin(institutionId: string): Promise<AdminSectorRow[]>;
  findById(
    id: string,
  ): Promise<{ id: string; institutionId: string; name: string; managerId: string | null; isActive: boolean } | null>;
  update(id: string, patch: UpdateSectorParams): Promise<void>;
  findActiveByInstitution(institutionId: string): Promise<{ id: string; name: string }[]>;
  findActiveByIds(institutionId: string, sectorIds: string[]): Promise<{ id: string; name: string }[]>;
  findAssignedSectorIds(managerId: string): Promise<string[]>;
  reassignManagerSectors(institutionId: string, managerId: string, sectorIds: string[]): Promise<void>;
  findByIdsInInstitution(institutionId: string, sectorIds: string[]): Promise<{ id: string }[]>;
  findByInviteCode(inviteCode: string): Promise<SectorWithInstitution | null>;
  delete(id: string): Promise<void>;
}

export const SECTOR_REPOSITORY = Symbol("SECTOR_REPOSITORY");

// Thrown on a unique-constraint violation on (institutionId, name).
export class SectorNameConflictError extends Error {}

// Thrown on a unique-constraint violation on inviteCode.
export class SectorInviteCodeConflictError extends Error {}
