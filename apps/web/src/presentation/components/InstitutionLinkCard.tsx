import { useEffect, useRef, useState } from 'react';
import { Building2 } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Button } from '@/presentation/ui/Button';
import { Card } from '@/presentation/ui/Card';
import { IconBadge } from '@/presentation/ui/IconBadge';
import { displayName } from '@/presentation/lib/display-name';
import { routes } from '@/presentation/lib/routes';
import { useInstitutionLinkStore } from '@/stores/institution-link.store';
import { useInstitutionNudgeStore } from '@/stores/institution-nudge.store';
import { ShouldShowInstitutionNudgeUseCase } from '@/use-cases/should-show-institution-nudge.usecase';

const shouldShowInstitutionNudgeUseCase = new ShouldShowInstitutionNudgeUseCase();

interface InstitutionLinkCardProps {
  className?: string;
  showLinked?: boolean;
}

export function InstitutionLinkCard({
  className = '',
  showLinked = false,
}: InstitutionLinkCardProps) {
  const navigate = useNavigate();
  const institutionId = useInstitutionLinkStore((state) => state.institutionId);
  const institutionName = useInstitutionLinkStore((state) => state.institutionName);
  const sectorName = useInstitutionLinkStore((state) => state.sectorName);
  const unlink = useInstitutionLinkStore((state) => state.unlink);
  const nudgeDismissedAt = useInstitutionNudgeStore((state) => state.dismissedAt);
  const dismissNudge = useInstitutionNudgeStore((state) => state.dismiss);

  const ctaRef = useRef<HTMLButtonElement>(null);
  const [shouldFocusCta, setShouldFocusCta] = useState(false);

  useEffect(() => {
    if (!shouldFocusCta) {
      return;
    }
    ctaRef.current?.focus();
    setShouldFocusCta(false);
  }, [shouldFocusCta]);

  if (institutionId === null) {
    const showNudge = shouldShowInstitutionNudgeUseCase.execute({
      dismissedAt: nudgeDismissedAt ? new Date(nudgeDismissedAt) : null,
      now: new Date(),
    });
    if (!showNudge) {
      return null;
    }

    return (
      <div className={className}>
        <Card tone="brand-tint">
          <p className="text-body font-extrabold text-ink">Ainda não vinculado a um hospital</p>
          <p className="mt-1 text-caption text-muted">
            Vincule para aparecer nos números do seu time, de forma anônima.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <Button
              ref={ctaRef}
              variant="outline"
              full={false}
              onClick={() => navigate(routes.linkInstitution)}
            >
              Vincular agora
            </Button>
            <Button variant="ghost" full={false} onClick={dismissNudge}>
              Agora não
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (!showLinked) {
    return null;
  }

  const institution = displayName(institutionName);
  const sector = displayName(sectorName);

  return (
    <Card size="md" className={className}>
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between md:gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <IconBadge icon={Building2} tone="neutral" />
          <div className="min-w-0">
            <p className="text-body font-extrabold wrap-break-word text-ink">
              {institution ? `Vinculado a ${institution}` : 'Vinculado'}
            </p>
            {sector && <p className="text-caption wrap-break-word text-muted">{sector}</p>}
          </div>
        </div>
        <Button
          variant="outline"
          full={false}
          className="md:flex-none"
          onClick={() => {
            unlink();
            setShouldFocusCta(true);
          }}
        >
          Desvincular
        </Button>
      </div>
    </Card>
  );
}
