import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { PhoneShell } from "@/presentation/layout/PhoneShell";
import { Button } from "@/presentation/ui/Button";
import { Card } from "@/presentation/ui/Card";
import { routes } from "@/presentation/lib/routes";
import { useAdminInstitutions } from "@/presentation/hooks/useAdminInstitutions";
import { useCreateInstitution } from "@/presentation/hooks/useCreateInstitution";
import { useAdminSessionStore } from "@/stores/admin-session.store";
import type { CreateInstitutionResult } from "@/ports/admin-institution.port";

export function AdminInstitutionsPage() {
  const navigate = useNavigate();
  const clearSession = useAdminSessionStore((state) => state.clearSession);
  const institutions = useAdminInstitutions();
  const createInstitution = useCreateInstitution();
  const [institutionName, setInstitutionName] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [hospitalAdminName, setHospitalAdminName] = useState("");
  const [hospitalAdminEmail, setHospitalAdminEmail] = useState("");
  const [lastCreated, setLastCreated] = useState<CreateInstitutionResult | null>(null);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    createInstitution.mutate(
      { institutionName, inviteCode, hospitalAdminName, hospitalAdminEmail },
      {
        onSuccess: (result) => {
          setLastCreated(result);
          setInstitutionName("");
          setInviteCode("");
          setHospitalAdminName("");
          setHospitalAdminEmail("");
        },
      },
    );
  };

  return (
    <PhoneShell centered>
      <div className="pt-7.5">
        <div className="mt-4 flex items-center justify-between">
          <h1 className="text-h1 text-ink">Instituições</h1>
          <button
            type="button"
            onClick={() => {
              clearSession();
              navigate(routes.adminLogin, { replace: true });
            }}
            className="text-label font-bold text-danger"
          >
            Sair
          </button>
        </div>
        <p className="mt-1.5 text-caption text-muted">Cadastre um novo hospital e seu primeiro gestor.</p>

        {lastCreated && (
          <div role="status">
            <Card tone="brand-tint" className="mt-4">
              <p className="text-label font-semibold text-ink-2">
                Convite enviado para {lastCreated.hospitalAdmin.email}.
              </p>
            </Card>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <Card className="mt-4">
            <label htmlFor="institution-name" className="text-label font-semibold text-ink-2">
              Nome do hospital
            </label>
            <input
              id="institution-name"
              value={institutionName}
              onChange={(event) => setInstitutionName(event.target.value)}
              className="mt-2 w-full rounded-pill border border-line bg-surface p-[13px_18px] text-[14.5px] text-ink"
            />

            <label htmlFor="invite-code-input" className="mt-4 block text-label font-semibold text-ink-2">
              Código de convite
            </label>
            <input
              id="invite-code-input"
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value)}
              className="mt-2 w-full rounded-pill border border-line bg-surface p-[13px_18px] text-[14.5px] text-ink"
            />

            <label htmlFor="hospital-admin-name" className="mt-4 block text-label font-semibold text-ink-2">
              Nome do gestor do hospital
            </label>
            <input
              id="hospital-admin-name"
              value={hospitalAdminName}
              onChange={(event) => setHospitalAdminName(event.target.value)}
              className="mt-2 w-full rounded-pill border border-line bg-surface p-[13px_18px] text-[14.5px] text-ink"
            />

            <label htmlFor="hospital-admin-email" className="mt-4 block text-label font-semibold text-ink-2">
              Email do gestor do hospital
            </label>
            <input
              id="hospital-admin-email"
              type="email"
              value={hospitalAdminEmail}
              onChange={(event) => setHospitalAdminEmail(event.target.value)}
              className="mt-2 w-full rounded-pill border border-line bg-surface p-[13px_18px] text-[14.5px] text-ink"
            />

            {createInstitution.isError && (
              <p role="alert" className="mt-2 text-label text-danger">
                Não foi possível criar a instituição agora. Tente novamente.
              </p>
            )}
          </Card>

          <div className="mt-4">
            <Button
              type="submit"
              variant="primary"
              loading={createInstitution.isPending}
              disabled={
                institutionName.trim().length === 0 ||
                inviteCode.trim().length === 0 ||
                hospitalAdminName.trim().length === 0 ||
                hospitalAdminEmail.trim().length === 0
              }
            >
              Criar instituição
            </Button>
          </div>
        </form>

        <div className="mt-6">
          <p className="text-body font-extrabold text-ink">Instituições cadastradas</p>
          <div className="mt-3 flex flex-col gap-3">
            {(institutions.data ?? []).map((institution) => (
              <Card key={institution.id}>
                <p className="text-body font-extrabold text-ink">{institution.name}</p>
                <p className="text-caption text-muted">Código: {institution.inviteCode}</p>
                <p className="text-caption text-muted">Gestores: {institution.hospitalAdminNames.join(", ") || "—"}</p>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </PhoneShell>
  );
}
