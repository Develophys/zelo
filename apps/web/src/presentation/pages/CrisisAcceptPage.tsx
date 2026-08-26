import { useState } from 'react';
import { useNavigate } from 'react-router';
import { PhoneShell } from '@/presentation/layout/PhoneShell';
import { Button } from '@/presentation/ui/Button';
import { Card } from '@/presentation/ui/Card';
import { routes } from '@/presentation/lib/routes';
import { getCrisisLine } from '@/presentation/lib/crisis-line';
import {
  GetCrisisDirectionUseCase,
  type ProfessionalBond,
} from '@/use-cases/get-crisis-direction.usecase';

const getCrisisDirectionUseCase = new GetCrisisDirectionUseCase();

export function CrisisAcceptPage() {
  const navigate = useNavigate();
  const [bond, setBond] = useState<ProfessionalBond | null>(null);
  const line = getCrisisLine();
  const direction = bond ? getCrisisDirectionUseCase.execute(bond) : null;

  return (
    <PhoneShell centered>
      <div className="flex min-h-full flex-col">

        {!direction && (
          <>
            <p className="text-caption text-muted">
              Você é atendido pelo SUS ou por um plano de saúde/rede privada?
            </p>
            <div className="mt-4 flex flex-col gap-3">
              <Button variant="outline" onClick={() => setBond('sus')}>
                SUS
              </Button>
              <Button variant="outline" onClick={() => setBond('private')}>
                Plano de saúde / rede privada
              </Button>
            </div>
          </>
        )}

        {direction && (
          <div className="mt-4">
            <Card>
              <p className="text-body font-extrabold text-ink">{direction.title}</p>
              <p className="mt-2 text-caption text-muted">{direction.message}</p>
            </Card>
          </div>
        )}

        <div className="mt-4">
          <Card tone="brand-tint">
            <p className="font-mono text-label text-ink-2">sempre disponível</p>
            <p className="text-body-strong text-ink">
              {line.label} · {line.phone}
            </p>
            <p className="text-caption text-muted">Ligação gratuita e sigilosa, 24h.</p>
          </Card>
        </div>

        <div className="flex-1" />

        {direction && (
          <Button variant="primary" onClick={() => navigate(routes.home)}>
            Entendi
          </Button>
        )}
      </div>
    </PhoneShell>
  );
}
