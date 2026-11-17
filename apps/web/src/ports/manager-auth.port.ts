import { z } from "zod";

export const ManagerLoginResultSchema = z.object({
  role: z.enum(["HOSPITAL_ADMIN", "SECTOR_MANAGER"]),
  name: z.string(),
});
export type ManagerLoginResult = z.infer<typeof ManagerLoginResultSchema>;
export type ManagerProfile = ManagerLoginResult;

export class InvalidManagerCredentialsError extends Error {}
export class InvalidOrExpiredManagerSetupTokenError extends Error {}

export interface ManagerAuthPort {
  login(email: string, password: string): Promise<ManagerLoginResult>;
  me(): Promise<ManagerProfile>;
  logout(): Promise<void>;
  finishSetup(token: string, password: string): Promise<void>;
  requestPasswordReset(email: string): Promise<void>;
}
