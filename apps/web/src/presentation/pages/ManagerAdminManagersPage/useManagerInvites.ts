import { useState } from "react";
import { toast } from "@/stores/toast.store";
import { useSendManagerSetPasswordEmail } from "@/presentation/hooks/useSendManagerSetPasswordEmail";
import type { ManagerSummary } from "@/ports/manager-admin.port";

/**
 * Both paths that mail a set-password link. Resending an invite is harmless
 * and fires straight from the row; resetting an active manager's password
 * invalidates the one they already use, so that one asks first.
 */
export function useManagerInvites() {
  const sendSetPasswordEmail = useSendManagerSetPasswordEmail();
  const [resetPasswordTarget, setResetPasswordTarget] = useState<ManagerSummary | null>(null);

  const resend = (manager: ManagerSummary) => {
    sendSetPasswordEmail.mutate(manager.id, {
      onSuccess: () => toast.success(`Convite enviado para ${manager.email}.`),
    });
  };

  const askToResetPassword = (manager: ManagerSummary) => setResetPasswordTarget(manager);

  const cancelResetPassword = () => setResetPasswordTarget(null);

  const confirmResetPassword = () => {
    if (!resetPasswordTarget) return;
    sendSetPasswordEmail.mutate(resetPasswordTarget.id, {
      onSuccess: () => {
        toast.success(`Convite enviado para ${resetPasswordTarget.email}.`);
        setResetPasswordTarget(null);
      },
    });
  };

  return {
    resetPasswordTarget,
    isSending: sendSetPasswordEmail.isPending,
    resend,
    askToResetPassword,
    cancelResetPassword,
    confirmResetPassword,
  };
}

export type ManagerInvites = ReturnType<typeof useManagerInvites>;
