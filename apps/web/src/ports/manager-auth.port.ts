import { z } from "zod";

export const ManagerLoginResultSchema = z.object({
  token: z.string(),
  expiresAt: z.string(),
  role: z.enum(["HOSPITAL_ADMIN", "SECTOR_MANAGER"]),
});
export type ManagerLoginResult = z.infer<typeof ManagerLoginResultSchema>;

export class InvalidManagerCredentialsError extends Error {}
export class InvalidOrExpiredManagerSetupTokenError extends Error {}

export interface ManagerAuthPort {
  login(email: string, password: string): Promise<ManagerLoginResult>;
  finishSetup(token: string, password: string): Promise<void>;
}
