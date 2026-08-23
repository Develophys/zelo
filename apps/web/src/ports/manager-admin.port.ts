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
  email: z.string(),
  role: z.enum(["HOSPITAL_ADMIN", "SECTOR_MANAGER"]),
  isActive: z.boolean(),
  sectorNames: z.array(z.string()),
  hasPassword: z.boolean(),
  setPasswordTokenExpiresAt: z.string().nullable(),
});
export type ManagerSummary = z.infer<typeof ManagerSummarySchema>;

export const CreateManagerResultSchema = z.object({
  manager: z.object({ id: z.string(), name: z.string(), email: z.string() }),
});
export type CreateManagerResult = z.infer<typeof CreateManagerResultSchema>;

export const PeerPartnerSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string(),
  specialty: z.string(),
  isActive: z.boolean(),
  hasPassword: z.boolean(),
  setPasswordTokenExpiresAt: z.string().nullable(),
});
export type PeerPartnerSummary = z.infer<typeof PeerPartnerSummarySchema>;

export const CreatePeerPartnerResultSchema = z.object({
  peerPartner: z.object({ id: z.string(), name: z.string(), email: z.string() }),
});
export type CreatePeerPartnerResult = z.infer<typeof CreatePeerPartnerResultSchema>;

export interface CreatePeerPartnerParams {
  name: string;
  email: string;
  specialty: string;
}

export interface UpdatePeerPartnerParams {
  isActive?: boolean;
  specialty?: string;
}

export class SectorNameConflictError extends Error {}
export class InvalidManagerAdminRequestError extends Error {}
export class LastActiveHospitalAdminError extends Error {}
export class ManagerAdminNotFoundError extends Error {}

export type AdminDeleteConflictReason =
  | "MANAGER_OWNS_SECTORS"
  | "LAST_ADMIN"
  | "SECTOR_HAS_HISTORY"
  | "UNKNOWN";

export class AdminDeleteConflictError extends Error {
  constructor(readonly reason: AdminDeleteConflictReason) {
    super(reason);
    this.name = "AdminDeleteConflictError";
  }
}

const CONFLICT_MESSAGE: Record<AdminDeleteConflictReason, string> = {
  SECTOR_HAS_HISTORY:
    "Este setor tem histórico de check-ins e não pode ser excluído. Pause-o para tirá-lo do painel.",
  MANAGER_OWNS_SECTORS:
    "Este gestor ainda é responsável por setores. Reatribua os setores antes de excluí-lo.",
  LAST_ADMIN:
    "Este é o último administrador ativo do hospital. Cadastre outro antes de excluí-lo.",
  UNKNOWN: "Não foi possível excluir. Tente de novo.",
};

export function deleteConflictMessage(error: unknown): string | null {
  return error instanceof AdminDeleteConflictError ? CONFLICT_MESSAGE[error.reason] : null;
}

export interface UpdateSectorParams {
  isActive?: boolean;
  managerId?: string | null;
}

export interface CreateManagerParams {
  name: string;
  email: string;
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
  sendManagerSetPasswordEmail(token: string, id: string): Promise<void>;
  listPeerPartners(token: string): Promise<PeerPartnerSummary[]>;
  createPeerPartner(token: string, params: CreatePeerPartnerParams): Promise<CreatePeerPartnerResult>;
  updatePeerPartner(token: string, id: string, patch: UpdatePeerPartnerParams): Promise<void>;
  sendPeerPartnerSetPasswordEmail(token: string, id: string): Promise<void>;
  deleteManager(token: string, id: string): Promise<void>;
  deleteSector(token: string, id: string): Promise<void>;
  deletePeerPartner(token: string, id: string): Promise<void>;
}
