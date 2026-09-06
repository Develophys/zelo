import { z } from "zod";

export const PeerPartnerLoginResultSchema = z.object({
  token: z.string(),
  expiresAt: z.string(),
  peerPartnerName: z.string(),
});
export type PeerPartnerLoginResult = z.infer<typeof PeerPartnerLoginResultSchema>;

export class InvalidPeerPartnerCredentialsError extends Error {}
export class InvalidOrExpiredPeerPartnerSetupTokenError extends Error {}

export interface PeerPartnerAuthPort {
  login(email: string, password: string): Promise<PeerPartnerLoginResult>;
  finishSetup(token: string, password: string): Promise<void>;
}
