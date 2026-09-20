import { useManagerSessionStore } from "@/stores/manager-session.store";
import { useAdminSessionStore } from "@/stores/admin-session.store";
import { usePeerPartnerSessionStore } from "@/stores/peer-partner-session.store";
import type { SessionRole } from "./session-expiry";

export function clearRoleSession(role: SessionRole): void {
  if (role === "manager") useManagerSessionStore.getState().clearSession();
  if (role === "admin") useAdminSessionStore.getState().clearSession();
  if (role === "peerPartner") usePeerPartnerSessionStore.getState().clearSession();
}
