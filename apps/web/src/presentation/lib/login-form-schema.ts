import { z } from "zod";

export const loginFormSchema = z.object({
  email: z.string().trim().min(1, "Informe o email.").email("Digite um email válido."),
  password: z.string().min(1, "Informe a senha."),
});

export type LoginFormValues = z.infer<typeof loginFormSchema>;
