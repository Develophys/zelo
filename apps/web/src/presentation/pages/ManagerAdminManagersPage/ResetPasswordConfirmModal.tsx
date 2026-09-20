import { Button } from "@/presentation/ui/Button";
import { Modal } from "@/presentation/ui/Modal";
import type { ManagerInvites } from "./useManagerInvites";

/** Asks before invalidating a password the manager is actively using. */
export function ResetPasswordConfirmModal({ invites }: { invites: ManagerInvites }) {
  const target = invites.resetPasswordTarget;

  return (
    <Modal
      isOpen={target !== null}
      onClose={invites.cancelResetPassword}
      title={target ? `Redefinir a senha de ${target.name}?` : ""}
      size="sm"
      footer={
        <>
          <Button variant="outline" full={false} onClick={invites.cancelResetPassword}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            full={false}
            isLoading={invites.isSending}
            onClick={invites.confirmResetPassword}
          >
            Redefinir senha
          </Button>
        </>
      }
    >
      <p className="text-label text-ink">
        A senha atual deixa de funcionar e {target?.name} recebe um email para criar uma nova.
      </p>
    </Modal>
  );
}
