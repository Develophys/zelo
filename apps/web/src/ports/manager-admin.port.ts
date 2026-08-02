import { z } from "zod";

export const AdminSectorSchema = z.object({
  id: z.string(),
  name: z.string(),
  isActive: z.boolean(),
  managerId: z.string().nullable(),
  managerName: z.string().nullable(),
});
export type AdminSector = z.infer<typeof AdminSectorSchema>;

export const ManagerSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  role: z.enum(["HOSPITAL_ADMIN", "SECTOR_MANAGER"]),
  isActive: z.boolean(),
  sectorNames: z.array(z.string()),
});
export type ManagerSummary = z.infer<typeof ManagerSummarySchema>;

export const CreateManagerResultSchema = z.object({
  manager: z.object({ id: z.string(), name: z.string() }),
  temporaryPassword: z.string(),
});
export type CreateManagerResult = z.infer<typeof CreateManagerResultSchema>;

export const ResetPasswordResultSchema = z.object({ temporaryPassword: z.string() });

export class SectorNameConflictError extends Error {}
export class InvalidManagerAdminRequestError extends Error {}
export class LastActiveHospitalAdminError extends Error {}
export class ManagerAdminNotFoundError extends Error {}

export interface UpdateSectorParams {
  isActive?: boolean;
  managerId?: string | null;
}

export interface CreateManagerParams {
  name: string;
  role: "HOSPITAL_ADMIN" | "SECTOR_MANAGER";
  sectorIds?: string[];
}

export interface UpdateManagerParams {
  isActive?: boolean;
  role?: "HOSPITAL_ADMIN" | "SECTOR_MANAGER";
  sectorIds?: string[];
}

export interface ManagerAdminPort {
  listSectors(token: string): Promise<AdminSector[]>;
  createSector(token: string, name: string): Promise<{ id: string; name: string }>;
  updateSector(token: string, id: string, patch: UpdateSectorParams): Promise<void>;
  listManagers(token: string): Promise<ManagerSummary[]>;
  createManager(token: string, params: CreateManagerParams): Promise<CreateManagerResult>;
  updateManager(token: string, id: string, patch: UpdateManagerParams): Promise<void>;
  resetManagerPassword(token: string, id: string): Promise<{ temporaryPassword: string }>;
}
