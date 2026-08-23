import { useState, type SubmitEvent } from "react";
import { Button } from "@/presentation/ui/Button";
import { Card } from "@/presentation/ui/Card";
import { useAdminPeerPartners } from "@/presentation/hooks/useAdminPeerPartners";
import { useCreatePeerPartner } from "@/presentation/hooks/useCreatePeerPartner";
import { useUpdatePeerPartner } from "@/presentation/hooks/useUpdatePeerPartner";
import { useSendPeerPartnerSetPasswordEmail } from "@/presentation/hooks/useSendPeerPartnerSetPasswordEmail";
import type { PeerPartnerSummary } from "@/ports/manager-admin.port";
import { TextField } from "@/presentation/ui/TextField";
import { accountStatusLabel } from '@/presentation/lib/manager-account-status';

export function ManagerAdminPeersPage() {
  const peerPartners = useAdminPeerPartners();
  const createPeerPartner = useCreatePeerPartner();
  const updatePeerPartner = useUpdatePeerPartner();
  const sendSetPasswordEmail = useSendPeerPartnerSetPasswordEmail();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [inviteSentTo, setInviteSentTo] = useState<string | null>(null);

  const handleSubmit = (event: SubmitEvent) => {
    event.preventDefault();
    createPeerPartner.mutate(
      { name, email, specialty },
      {
        onSuccess: (result) => {
          setInviteSentTo(result.peerPartner.email);
          setName("");
          setEmail("");
          setSpecialty("");
        },
      },
    );
  };

  const handleSendSetPasswordEmail = (peerPartner: PeerPartnerSummary) => {
    sendSetPasswordEmail.mutate(peerPartner.id, { onSuccess: () => setInviteSentTo(peerPartner.email) });
  };

  return (
    <div>
      {inviteSentTo && (
        <div role="status">
          <Card tone="brand-tint" className="mt-4">
            <p className="text-label font-semibold text-ink-2">Convite enviado para {inviteSentTo}.</p>
          </Card>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <Card className="mt-4">
          <label htmlFor="peer-partner-name-input" className="text-label font-semibold text-ink-2">
            Nome do par
          </label>
          <TextField
            id="peer-partner-name-input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-2"
          />

          <label htmlFor="peer-partner-email-input" className="mt-4 block text-label font-semibold text-ink-2">
            Email do par
          </label>
          <TextField
            id="peer-partner-email-input"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-2"
          />

          <label htmlFor="peer-partner-specialty-input" className="mt-4 block text-label font-semibold text-ink-2">
            Especialidade
          </label>
          <TextField
            id="peer-partner-specialty-input"
            value={specialty}
            onChange={(event) => setSpecialty(event.target.value)}
            placeholder="Ex: Clínica médica"
            className="mt-2"
          />
        </Card>
        <div className="mt-3">
          <Button
            type="submit"
            variant="primary"
            isLoading={createPeerPartner.isPending}
            disabled={name.trim().length === 0 || email.trim().length === 0 || specialty.trim().length === 0}
          >
            Adicionar par
          </Button>
        </div>
      </form>

      <div className="mt-5 flex flex-col gap-3">
        {(peerPartners.data ?? []).map((peerPartner) => (
          <Card key={peerPartner.id}>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-body font-extrabold text-ink">{peerPartner.name}</p>
                <p className="text-caption text-muted">
                  {peerPartner.specialty} · {accountStatusLabel(peerPartner.hasPassword, peerPartner.setPasswordTokenExpiresAt)}
                  {!peerPartner.isActive && " · Inativo"}
                </p>
              </div>
              <Button
                variant="outline"
                full={false}
                onClick={() => updatePeerPartner.mutate({ id: peerPartner.id, patch: { isActive: !peerPartner.isActive } })}
              >
                {peerPartner.isActive ? "Desativar" : "Ativar"}
              </Button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="outline"
                full={false}
                aria-label={peerPartner.hasPassword ? `Redefinir senha de ${peerPartner.name}` : `Reenviar convite de ${peerPartner.name}`}
                isLoading={sendSetPasswordEmail.isPending && sendSetPasswordEmail.variables === peerPartner.id}
                onClick={() => handleSendSetPasswordEmail(peerPartner)}
              >
                {peerPartner.hasPassword ? "Redefinir senha" : "Reenviar convite"}
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
