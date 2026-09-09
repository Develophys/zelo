import { PhoneShell } from '@/presentation/layout/PhoneShell';
import { Button } from '@/presentation/ui/Button';
import { Card } from '@/presentation/ui/Card';

interface LinkInstitutionConfirmStepProps {
  institutionName: string;
  sectorName: string;
  onConfirm: () => void;
  onReject: () => void;
}

export function LinkInstitutionConfirmStep({
  institutionName,
  sectorName,
  onConfirm,
  onReject,
}: LinkInstitutionConfirmStepProps) {
  return (
    <PhoneShell bottomNav centered headerOverride={{ title: 'Vincular ao hospital' }}>
      <p className="text-pretty text-body text-ink-2">
        Confira se são estes o hospital e o setor antes de vincular.
      </p>
      <Card className="mt-4">
        <p className="text-label text-muted">Instituição</p>
        <p className="text-h2 text-ink">{institutionName}</p>
        <p className="mt-3 text-label text-muted">Setor</p>
        <p className="text-h2 text-ink">{sectorName}</p>
      </Card>

      <div className="mt-6 flex flex-col gap-3">
        <Button type="button" variant="primary" onClick={onConfirm}>
          Confirmar
        </Button>
        <Button type="button" variant="outline" onClick={onReject}>
          Não é isso
        </Button>
      </div>
    </PhoneShell>
  );
}
