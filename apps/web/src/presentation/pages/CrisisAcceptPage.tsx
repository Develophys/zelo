import { useState } from 'react';
import { useNavigate } from 'react-router';
import { PhoneShell } from '@/presentation/layout/PhoneShell';
import { Button } from '@/presentation/ui/Button';
import { Card } from '@/presentation/ui/Card';
import { CrisisCallLink } from '@/presentation/components/CrisisCallLink';
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
    <PhoneShell bottomNav centered>
      <div className="flex min-h-full flex-col">
        <h2 className="font-serif text-h2 text-ink">Você pode falar com alguém agora.</h2>
        <p className="mt-2 text-body text-muted">
          O {line.fullLabel} atende 24 horas, de graça e em sigilo. Você não precisa se identificar.
        </p>

        <div className="mt-5">
          <Card size="lg" tone="brand">
            <p className="font-mono text-eyebrow uppercase text-on-fill-2">linha de crise · 24h</p>
            <p className="mt-2 font-serif text-[40px]">
              {line.label} {line.phone}
            </p>
            <CrisisCallLink
              line={line}
              className="mt-4 min-h-13 w-full justify-center bg-on-fill text-brand-fill focus-visible:ring-on-fill focus-visible:ring-offset-brand-fill"
            />
          </Card>
        </div>

        <div className="mt-8">
          <p className="text-caption text-muted">
            Quer que eu te indique onde procurar acompanhamento depois? Você é atendido pelo SUS ou
            por um plano de saúde/rede privada?
          </p>
          {!direction && (
            <div className="mt-4 flex flex-col gap-3">
              <Button variant="outline" onClick={() => setBond('sus')}>
                SUS
              </Button>
              <Button variant="outline" onClick={() => setBond('private')}>
                Plano de saúde / rede privada
              </Button>
            </div>
          )}
        </div>

        {direction && (
          <div className="mt-4">
            <Card>
              <p className="text-body font-extrabold text-ink">{direction.title}</p>
              <p className="mt-2 text-caption text-muted">{direction.message}</p>
            </Card>
          </div>
        )}

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
