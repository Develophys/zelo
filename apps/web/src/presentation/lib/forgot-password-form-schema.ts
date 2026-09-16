import { z } from "zod";

export const forgotPasswordFormSchema = z.object({
  email: z.string().trim().min(1, "Informe o email.").email("Digite um email válido."),
});

export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordFormSchema>;
