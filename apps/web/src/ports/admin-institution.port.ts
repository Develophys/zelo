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
  createdAt: z.string(),
  hospitalAdminNames: z.array(z.string()),
});
export type AdminInstitutionListItem = z.infer<typeof AdminInstitutionListItemSchema>;

export class DuplicateInstitutionError extends Error {}
export class UnauthorizedAdminError extends Error {}

export interface CreateInstitutionParams {
  institutionName: string;
  inviteCode: string;
  hospitalAdminName: string;
  hospitalAdminEmail: string;
}

export interface AdminInstitutionPort {
  create(token: string, params: CreateInstitutionParams): Promise<CreateInstitutionResult>;
  list(token: string): Promise<AdminInstitutionListItem[]>;
}
