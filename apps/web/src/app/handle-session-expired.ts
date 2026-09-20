import { routes } from "@/presentation/lib/routes";
import type { SessionRole } from "./session-expiry";

const LOGIN_ROUTE: Record<SessionRole, string> = {
  manager: routes.managerLogin,
  admin: routes.adminLogin,
  peerPartner: routes.peerPartnerLogin,
};

interface HandleSessionExpiredDeps {
  clearSession: (role: SessionRole) => void;
  currentPath: () => string;
  navigate: (to: string, options: { replace: true; state: { reason: "expired" } }) => void;
}

export function handleSessionExpired(role: SessionRole, { clearSession, currentPath, navigate }: HandleSessionExpiredDeps): void {
  clearSession(role);
  const loginRoute = LOGIN_ROUTE[role];
  if (currentPath() === loginRoute) return;
  navigate(loginRoute, { replace: true, state: { reason: "expired" } });
}
