import { useNavigate } from "react-router";
import { PhoneShell } from "@/presentation/layout/PhoneShell";
import { FinishSetupForm } from "@/presentation/components/FinishSetupForm";
import { useFinishPeerPartnerSetup } from "@/presentation/hooks/useFinishPeerPartnerSetup";
import { routes } from "@/presentation/lib/routes";

export function PeerPartnerFinishSetupPage() {
  const navigate = useNavigate();
  const finishSetup = useFinishPeerPartnerSetup();

  return (
    <PhoneShell centered>
      <div className="pt-7.5">
        <h1 className="mb-1.5 mt-4 text-h1 text-ink">Finalize seu cadastro</h1>
        <p className="text-caption text-muted">Escolha uma senha para acessar sua conta de par anônimo.</p>

        <FinishSetupForm
          onSubmit={({ token, password }) => finishSetup.mutateAsync({ token, password })}
          onSuccess={() => navigate(routes.peerPartnerLogin, { replace: true })}
        />
      </div>
    </PhoneShell>
  );
}
