import { z } from "zod";

export const peerPartnerFormSchema = z.object({
  name: z.string().trim().min(1, "Informe o nome do par."),
  email: z.string().trim().min(1, "Informe o email do par.").email("Digite um email válido."),
  specialty: z.string().trim().min(1, "Informe a especialidade."),
});

export type PeerPartnerFormValues = z.infer<typeof peerPartnerFormSchema>;
