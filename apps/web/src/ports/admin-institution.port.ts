import { z } from "zod";

export const CreateInstitutionResultSchema = z.object({
  institution: z.object({ id: z.string(), name: z.string(), inviteCode: z.string() }),
  hospitalAdmin: z.object({ id: z.string(), name: z.string(), email: z.string() }),
});
export type CreateInstitutionResult = z.infer<typeof CreateInstitutionResultSchema>;

export const AdminInstitutionListItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  inviteCode: z.string(),
  isActive: z.boolean(),
  createdAt: z.string(),
  hospitalAdminNames: z.array(z.string()),
});
export type AdminInstitutionListItem = z.infer<typeof AdminInstitutionListItemSchema>;

export const AdminInstitutionPageSchema = z.object({
  items: z.array(AdminInstitutionListItemSchema),
  nextCursor: z.string().nullable(),
  total: z.number().nullable(),
});
export type AdminInstitutionPage = z.infer<typeof AdminInstitutionPageSchema>;

export class DuplicateInstitutionError extends Error {}
export class UnauthorizedAdminError extends Error {}
export class AdminInstitutionNotFoundError extends Error {}

export interface CreateInstitutionParams {
  institutionName: string;
  inviteCode: string;
  hospitalAdminName: string;
  hospitalAdminEmail: string;
}

// inviteCode is deliberately absent: it's immutable once created (see the
// backend port for why), so there is nothing to send for it.
export interface UpdateInstitutionParams {
  name?: string;
  isActive?: boolean;
}

export interface AdminInstitutionPort {
  create(token: string, params: CreateInstitutionParams): Promise<CreateInstitutionResult>;
  list(token: string, query: { cursor?: string | null; limit?: number }): Promise<AdminInstitutionPage>;
  update(token: string, id: string, patch: UpdateInstitutionParams): Promise<void>;
}
