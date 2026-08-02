import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { PhoneShell } from "@/presentation/layout/PhoneShell";
import { BackButton } from "@/presentation/ui/BackButton";
import { Button } from "@/presentation/ui/Button";
import { Card } from "@/presentation/ui/Card";
import { routes } from "@/presentation/lib/routes";
import { useLookupInstitution } from "@/presentation/hooks/useLookupInstitution";
import { useInstitutionLinkStore } from "@/stores/institution-link.store";
import { InstitutionNotFoundError } from "@/ports/institution-link.port";

export function LinkInstitutionPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"code" | "department">("code");
  const [code, setCode] = useState("");
  const [department, setDepartment] = useState("");
  const [institution, setInstitution] = useState<{ id: string; name: string } | null>(null);
  const lookup = useLookupInstitution();
  const link = useInstitutionLinkStore((state) => state.link);

  const handleCodeSubmit = (event: FormEvent) => {
    event.preventDefault();
    lookup.mutate(code, {
      onSuccess: (result) => {
        setInstitution(result);
        setStep("department");
      },
    });
  };

  const handleDepartmentSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!institution) return;
    link({ institutionId: institution.id, institutionName: institution.name, department });
    navigate(routes.you);
  };

  const errorMessage = lookup.isError
    ? lookup.error instanceof InstitutionNotFoundError
      ? "Código não encontrado."
      : "Não foi possível verificar agora. Tente novamente."
    : null;

  if (step === "department" && institution) {
    return (
      <PhoneShell centered>
        <div className="pt-[30px]">
          <BackButton label="Voltar" onClick={() => setStep("code")} />
          <h1 className="mb-[6px] mt-4 text-h1 text-ink">Qual seu setor?</h1>
          <p className="text-caption text-muted">Vinculando a {institution.name}.</p>

          <form onSubmit={handleDepartmentSubmit}>
            <Card className="mt-5">
              <label htmlFor="department" className="text-label font-semibold text-ink-2">
                Setor
              </label>
              <input
                id="department"
                value={department}
                onChange={(event) => setDepartment(event.target.value)}
                placeholder="Ex: UTI, Pronto-socorro"
                className="mt-2 w-full rounded-pill border border-line bg-surface p-[13px_18px] text-[14.5px] text-ink placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
              />
            </Card>

            <div className="mt-[24px]">
              <Button type="submit" variant="primary" disabled={department.trim().length === 0}>
                Concluir
              </Button>
            </div>
          </form>
        </div>
      </PhoneShell>
    );
  }

  return (
    <PhoneShell centered>
      <div className="pt-[30px]">
        <BackButton label="Você" onClick={() => navigate(routes.you)} />
        <h1 className="mb-[6px] mt-4 text-h1 text-ink">Vincular ao hospital</h1>
        <p className="text-caption text-muted">
          Digite o código do seu hospital para aparecer nos números do seu time.
        </p>

        <form onSubmit={handleCodeSubmit}>
          <Card className="mt-5">
            <label htmlFor="invite-code" className="text-label font-semibold text-ink-2">
              Código do hospital
            </label>
            <input
              id="invite-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="Digite o código"
              className="mt-2 w-full rounded-pill border border-line bg-surface p-[13px_18px] text-[14.5px] text-ink placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />

            {errorMessage && (
              <p role="alert" className="mt-2 text-label text-danger">
                {errorMessage}
              </p>
            )}
          </Card>

          <div className="mt-[24px]">
            <Button type="submit" variant="primary" loading={lookup.isPending} disabled={code.trim().length === 0}>
              Continuar
            </Button>
          </div>
        </form>
      </div>
    </PhoneShell>
  );
}
