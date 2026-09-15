import type { ManagerRole } from "../ports/manager-repository.port.ts";

export interface PendingManagerInviteCheck {
  role: ManagerRole;
  passwordHash: string | null;
  setPasswordTokenExpiresAt: Date | null;
}

// A SECTOR_MANAGER created without a sector is left with no password-setup
// token (see CreateManagerUseCase), so "never invited yet" is exactly
// passwordHash === null && setPasswordTokenExpiresAt === null. Once either is
// set, an invite/reset link already exists (or the manager is active) and
// linking another sector shouldn't fire a second one.
export function shouldTriggerPendingManagerInvite(
  manager: PendingManagerInviteCheck,
  willHaveAtLeastOneSector: boolean,
): boolean {
  return (
    willHaveAtLeastOneSector &&
    manager.role === "SECTOR_MANAGER" &&
    manager.passwordHash === null &&
    manager.setPasswordTokenExpiresAt === null
  );
}
