import { z } from "zod";

export const createInstitutionFormSchema = z.object({
  institutionName: z.string().trim().min(1, "Informe o nome do hospital."),
  inviteCode: z.string().trim().min(1, "Informe o código de convite."),
  hospitalAdminName: z.string().trim().min(1, "Informe o nome do gestor."),
  hospitalAdminEmail: z
    .string()
    .trim()
    .min(1, "Informe o email do gestor.")
    .email("Digite um email válido."),
});

export type CreateInstitutionFormValues = z.infer<typeof createInstitutionFormSchema>;

export const editInstitutionFormSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do hospital."),
});

export type EditInstitutionFormValues = z.infer<typeof editInstitutionFormSchema>;
