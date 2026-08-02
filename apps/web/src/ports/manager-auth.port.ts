import { z } from "zod";

export const ManagerLoginResultSchema = z.object({
  token: z.string(),
  expiresAt: z.string(),
});
export type ManagerLoginResult = z.infer<typeof ManagerLoginResultSchema>;

export class InvalidManagerCredentialsError extends Error {}

export interface ManagerAuthPort {
  login(name: string, password: string): Promise<ManagerLoginResult>;
}
