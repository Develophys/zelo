export interface AdminSectorRow {
  id: string;
  name: string;
  isActive: boolean;
  managerId: string | null;
  managerName: string | null;
}

export interface UpdateSectorParams {
  isActive?: boolean;
  managerId?: string | null;
}

export interface SectorRepository {
  create(institutionId: string, name: string): Promise<{ id: string; name: string }>;
  findAllForAdmin(institutionId: string): Promise<AdminSectorRow[]>;
  findById(id: string): Promise<{ id: string; institutionId: string } | null>;
  update(id: string, patch: UpdateSectorParams): Promise<void>;
  findActiveByInstitution(institutionId: string): Promise<{ id: string; name: string }[]>;
  findActiveByIds(institutionId: string, sectorIds: string[]): Promise<{ id: string; name: string }[]>;
  findAssignedSectorIds(managerId: string): Promise<string[]>;
  reassignManagerSectors(institutionId: string, managerId: string, sectorIds: string[]): Promise<void>;
  findByIdsInInstitution(institutionId: string, sectorIds: string[]): Promise<{ id: string }[]>;
}

export const SECTOR_REPOSITORY = Symbol("SECTOR_REPOSITORY");

// Thrown on a unique-constraint violation on (institutionId, name).
export class SectorNameConflictError extends Error {}
