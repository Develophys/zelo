import { PhoneShell } from '@/presentation/layout/PhoneShell';
import { BackButton } from '@/presentation/ui/BackButton';
import { Button } from '@/presentation/ui/Button';
import { Card } from '@/presentation/ui/Card';
import { useLinkInstitutionFlow } from '@/presentation/hooks/useLinkInstitutionFlow';

export function LinkInstitutionPage() {
  const flow = useLinkInstitutionFlow();

  if (flow.step === 'sector') {
    return (
      <PhoneShell centered>
        <div className="pt-7.5">
          <BackButton label="Voltar" onClick={flow.goToCodeStep} />
          <h1 className="mb-1.5 mt-4 text-h1 text-ink">Qual seu setor?</h1>
          <p className="text-caption text-muted">Vinculando a {flow.institutionName}.</p>

          <form onSubmit={flow.handleSectorSubmit}>
            <Card className="mt-5">
              {flow.sectors.isLoading && <p className="text-label text-muted">Carregando setores...</p>}
              {!flow.sectors.isLoading && !flow.sectors.hasSectors && (
                <p role="alert" className="text-label text-danger">
                  Seu hospital ainda não cadastrou os setores.
                </p>
              )}
              {!flow.sectors.isLoading &&
                flow.sectors.hasSectors &&
                flow.sectors.list.map((sector) => (
                  <label
                    key={sector.id}
                    className="flex items-center gap-2 py-2 text-label text-ink-2"
                  >
                    <input
                      type="radio"
                      name="sector"
                      value={sector.id}
                      checked={flow.sectorId === sector.id}
                      onChange={() => flow.onSectorSelect(sector.id)}
                    />
                    {sector.name}
                  </label>
                ))}
            </Card>

            <div className="mt-6">
              <Button
                type="submit"
                variant="primary"
                disabled={!flow.sectors.hasSectors || flow.sectorId === null}
              >
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
      <div className="pt-7.5">
        <BackButton label="Você" onClick={flow.goToYou} />
        <h1 className="mb-1.5 mt-4 text-h1 text-ink">Vincular ao hospital</h1>
        <p className="text-caption text-muted">
          Digite o código do seu hospital para aparecer nos números do seu time.
        </p>

        <form onSubmit={flow.handleCodeSubmit}>
          <Card className="mt-5">
            <label htmlFor="invite-code" className="text-label font-semibold text-ink-2">
              Código do hospital
            </label>
            <input
              id="invite-code"
              value={flow.code}
              onChange={(event) => flow.onCodeChange(event.target.value)}
              placeholder="Digite o código"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              className="mt-2 w-full rounded-pill border border-line bg-surface p-[13px_18px] text-[14.5px] text-ink placeholder:text-faint focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            />

            {flow.codeErrorMessage && (
              <p role="alert" className="mt-2 text-label text-danger">
                {flow.codeErrorMessage}
              </p>
            )}
          </Card>

          <div className="mt-6">
            <Button
              type="submit"
              variant="primary"
              loading={flow.isLookupPending}
              disabled={flow.code.trim().length === 0}
            >
              Continuar
            </Button>
          </div>
        </form>
      </div>
    </PhoneShell>
  );
}
