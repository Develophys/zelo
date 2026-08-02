import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { PhoneShell } from "@/presentation/layout/PhoneShell";
import { BackButton } from "@/presentation/ui/BackButton";
import { Button } from "@/presentation/ui/Button";
import { Card } from "@/presentation/ui/Card";
import { routes } from "@/presentation/lib/routes";
import { useLookupInstitution } from "@/presentation/hooks/useLookupInstitution";
import { useInstitutionSectors } from "@/presentation/hooks/useInstitutionSectors";
import { useInstitutionLinkStore } from "@/stores/institution-link.store";
import { InstitutionNotFoundError } from "@/ports/institution-link.port";

export function LinkInstitutionPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"code" | "sector">("code");
  const [code, setCode] = useState("");
  const [sectorId, setSectorId] = useState<string | null>(null);
  const [institution, setInstitution] = useState<{ id: string; name: string } | null>(null);
  const lookup = useLookupInstitution();
  const sectors = useInstitutionSectors(institution?.id ?? null);
  const link = useInstitutionLinkStore((state) => state.link);

  const handleCodeSubmit = (event: FormEvent) => {
    event.preventDefault();
    lookup.mutate(code.trim(), {
      onSuccess: (result) => {
        setInstitution(result);
        setStep("sector");
      },
    });
  };

  const handleSectorSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!institution || !sectorId) return;
    const sector = sectors.data?.find((candidate) => candidate.id === sectorId);
    if (!sector) return;
    link({ institutionId: institution.id, institutionName: institution.name, sectorId: sector.id, sectorName: sector.name });
    navigate(routes.you);
  };

  const errorMessage = lookup.isError
    ? lookup.error instanceof InstitutionNotFoundError
      ? "Código não encontrado."
      : "Não foi possível verificar agora. Tente novamente."
    : null;

  if (step === "sector" && institution) {
    const hasSectors = (sectors.data?.length ?? 0) > 0;

    return (
      <PhoneShell centered>
        <div className="pt-[30px]">
          <BackButton label="Voltar" onClick={() => setStep("code")} />
          <h1 className="mb-[6px] mt-4 text-h1 text-ink">Qual seu setor?</h1>
          <p className="text-caption text-muted">Vinculando a {institution.name}.</p>

          <form onSubmit={handleSectorSubmit}>
            <Card className="mt-5">
              {sectors.isLoading && <p className="text-label text-muted">Carregando setores...</p>}
              {!sectors.isLoading && !hasSectors && (
                <p role="alert" className="text-label text-danger">
                  Seu hospital ainda não cadastrou os setores.
                </p>
              )}
              {!sectors.isLoading &&
                hasSectors &&
                sectors.data!.map((sector) => (
                  <label key={sector.id} className="flex items-center gap-2 py-2 text-label text-ink-2">
                    <input
                      type="radio"
                      name="sector"
                      value={sector.id}
                      checked={sectorId === sector.id}
                      onChange={() => setSectorId(sector.id)}
                    />
                    {sector.name}
                  </label>
                ))}
            </Card>

            <div className="mt-[24px]">
              <Button type="submit" variant="primary" disabled={!hasSectors || sectorId === null}>
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
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
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
