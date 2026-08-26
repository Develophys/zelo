import type { LinkInstitutionFlow } from '@/presentation/hooks/useLinkInstitutionFlow';
import { LinkStepShell } from '@/presentation/components/LinkStepShell';

type LinkInstitutionSectorStepProps = Pick<
  LinkInstitutionFlow,
  'institutionName' | 'sectors' | 'sectorId' | 'onSectorSelect' | 'handleSectorSubmit'
>;

export function LinkInstitutionSectorStep({
  institutionName,
  sectors,
  sectorId,
  onSectorSelect,
  handleSectorSubmit,
}: LinkInstitutionSectorStepProps) {
  return (
    <LinkStepShell
      title="Qual seu setor?"
      subtitle={`Vinculando a ${institutionName}.`}
      onSubmit={handleSectorSubmit}
      submitLabel="Concluir"
      submitDisabled={!sectors.hasSectors || sectorId === null}
    >
      {sectors.isLoading && <p className="text-label text-muted">Carregando setores...</p>}
      {!sectors.isLoading && !sectors.hasSectors && (
        <p role="alert" className="text-label text-danger">
          Seu hospital ainda não cadastrou os setores.
        </p>
      )}
      {!sectors.isLoading &&
        sectors.hasSectors &&
        sectors.list.map((sector) => (
          <label key={sector.id} className="flex items-center gap-2 py-2 text-label text-ink-2">
            <input
              type="radio"
              name="sector"
              value={sector.id}
              checked={sectorId === sector.id}
              onChange={() => onSectorSelect(sector.id)}
            />
            {sector.name}
          </label>
        ))}
    </LinkStepShell>
  );
}
