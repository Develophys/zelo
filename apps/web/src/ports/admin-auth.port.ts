import { z } from "zod";

export const AdminLoginResultSchema = z.object({ token: z.string(), expiresAt: z.string() });
export type AdminLoginResult = z.infer<typeof AdminLoginResultSchema>;

export class InvalidAdminCredentialsError extends Error {}

export interface AdminAuthPort {
  login(email: string, password: string): Promise<AdminLoginResult>;
}
