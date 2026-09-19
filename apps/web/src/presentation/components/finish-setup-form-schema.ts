import { z } from "zod";
import { MIN_PASSWORD_LENGTH } from "@zelo/domain";

export const finishSetupFormSchema = z
  .object({
    password: z.string().min(MIN_PASSWORD_LENGTH, `A senha precisa ter pelo menos ${MIN_PASSWORD_LENGTH} caracteres.`),
    confirmPassword: z.string().min(1, "Confirme a senha."),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "As senhas não coincidem.",
    path: ["confirmPassword"],
  });

export type FinishSetupFormValues = z.infer<typeof finishSetupFormSchema>;
