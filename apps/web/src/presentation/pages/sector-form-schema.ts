import { z } from "zod";

export const createSectorFormSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do setor."),
});

export type CreateSectorFormValues = z.infer<typeof createSectorFormSchema>;
