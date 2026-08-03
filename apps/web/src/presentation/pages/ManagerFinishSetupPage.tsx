import { useNavigate } from "react-router";
import { PhoneShell } from "@/presentation/layout/PhoneShell";
import { FinishSetupForm } from "@/presentation/components/FinishSetupForm";
import { useFinishManagerSetup } from "@/presentation/hooks/useFinishManagerSetup";
import { routes } from "@/presentation/lib/routes";

export function ManagerFinishSetupPage() {
  const navigate = useNavigate();
  const finishSetup = useFinishManagerSetup();

  return (
    <PhoneShell centered>
      <div className="pt-7.5">
        <h1 className="mb-1.5 mt-4 text-h1 text-ink">Finalize seu cadastro</h1>
        <p className="text-caption text-muted">Escolha uma senha para acessar sua conta de gestor.</p>

        <FinishSetupForm
          onSubmit={({ token, password }) => finishSetup.mutateAsync({ token, password })}
          onSuccess={() => navigate(routes.managerLogin, { replace: true })}
        />
      </div>
    </PhoneShell>
  );
}
