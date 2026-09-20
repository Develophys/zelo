import { UnauthorizedAdminError } from "@/ports/admin-institution.port";
import { UnauthorizedManagerError } from "@/ports/manager-signals.port";
import { UnauthorizedPeerPartnerError } from "@/ports/peer-partner-auth.port";

export type SessionRole = "manager" | "admin" | "peerPartner";

export function sessionRoleOfError(error: unknown): SessionRole | null {
  if (error instanceof UnauthorizedManagerError) return "manager";
  if (error instanceof UnauthorizedAdminError) return "admin";
  if (error instanceof UnauthorizedPeerPartnerError) return "peerPartner";
  return null;
}
