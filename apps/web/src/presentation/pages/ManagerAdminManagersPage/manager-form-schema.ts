import { z } from "zod";

// role/sectorIds aren't here — neither has a validation rule (see useManagerCreateFlow).
export const managerFormSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do gestor."),
  email: z.string().trim().min(1, "Informe o email do gestor.").email("Digite um email válido."),
});

export type ManagerFormValues = z.infer<typeof managerFormSchema>;
