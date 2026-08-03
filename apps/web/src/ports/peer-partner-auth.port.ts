import { z } from "zod";

export const PeerPartnerLoginResultSchema = z.object({ token: z.string(), expiresAt: z.string() });
export type PeerPartnerLoginResult = z.infer<typeof PeerPartnerLoginResultSchema>;

export class InvalidPeerPartnerCredentialsError extends Error {}

export interface PeerPartnerAuthPort {
  login(name: string, password: string): Promise<PeerPartnerLoginResult>;
}
