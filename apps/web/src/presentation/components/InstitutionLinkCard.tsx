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
import { useInlineConfirm } from '@/presentation/hooks/useInlineConfirm';

const shouldShowInstitutionNudgeUseCase = new ShouldShowInstitutionNudgeUseCase();

interface InstitutionLinkCardProps {
  className?: string;
  showLinked?: boolean;
  // Keeps the unprompted "link your hospital" ask off screen when Home has a
  // higher-stakes reason not to compete for attention right now (a "não
  // estou bem" disclosure) — never applies to the dismiss/unlink
  // acknowledgments below, which are direct results of the person's own
  // just-now action on this card.
  suppressNudge?: boolean;
}

export function InstitutionLinkCard({
  className = '',
  showLinked = false,
  suppressNudge = false,
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
  const dismissAckRef = useRef<HTMLDivElement>(null);
  // Scoped to this mount, same reasoning as FollowUpCard's answeredThisCycle
  // derivation: the persisted dismissedAt is what actually suppresses the
  // nudge on a later visit, so returning to this screen later shows
  // nothing, not a replayed acknowledgment.
  const [justDismissedNudge, setJustDismissedNudge] = useState(false);
  const unlinkAckRef = useRef<HTMLDivElement>(null);
  // Set instead of shouldFocusCta when Desvincular fires while the nudge is
  // still snoozed from an earlier dismissal — the render that follows has no
  // "Vincular agora" button for ctaRef to land on, so there is nowhere for
  // the usual focus restoration to go without this fallback.
  const [justUnlinkedIntoQuiet, setJustUnlinkedIntoQuiet] = useState(false);
  const unlinkConfirm = useInlineConfirm();

  useEffect(() => {
    if (!shouldFocusCta) {
      return;
    }
    ctaRef.current?.focus();
    setShouldFocusCta(false);
  }, [shouldFocusCta]);

  useEffect(() => {
    if (!justDismissedNudge) {
      return;
    }
    dismissAckRef.current?.focus();
  }, [justDismissedNudge]);

  useEffect(() => {
    if (!justUnlinkedIntoQuiet) {
      return;
    }
    unlinkAckRef.current?.focus();
  }, [justUnlinkedIntoQuiet]);

  if (institutionId === null) {
    if (justDismissedNudge) {
      return (
        <div className={className} role="status" aria-live="polite" aria-atomic="true">
          <Card tone="brand-tint">
            <div ref={dismissAckRef} tabIndex={-1}>
              <p className="text-body font-extrabold text-ink">Tudo bem, sem pressa.</p>
              <p className="mt-1 text-caption text-muted">Perguntamos de novo em alguns dias.</p>
            </div>
          </Card>
        </div>
      );
    }

    if (justUnlinkedIntoQuiet) {
      return (
        <div className={className} role="status" aria-live="polite" aria-atomic="true">
          <Card tone="brand-tint">
            <div ref={unlinkAckRef} tabIndex={-1}>
              <p className="text-caption text-muted">Desvinculado.</p>
            </div>
          </Card>
        </div>
      );
    }

    const showNudge =
      !suppressNudge &&
      shouldShowInstitutionNudgeUseCase.execute({
        dismissedAt: nudgeDismissedAt ? new Date(nudgeDismissedAt) : null,
        now: new Date(),
      });
    if (!showNudge) {
      return null;
    }

    return (
      <div className={className} role="status" aria-live="polite" aria-atomic="true">
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
            <Button
              variant="ghost"
              full={false}
              onClick={() => {
                dismissNudge();
                setJustDismissedNudge(true);
              }}
            >
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

  const handleUnlink = () => {
    unlink();
    const willShowNudge = shouldShowInstitutionNudgeUseCase.execute({
      dismissedAt: nudgeDismissedAt ? new Date(nudgeDismissedAt) : null,
      now: new Date(),
    });
    if (willShowNudge) {
      setShouldFocusCta(true);
    } else {
      setJustUnlinkedIntoQuiet(true);
    }
  };

  // Institution linkage is what makes a doctor visible in their team's
  // aggregate — a one-tap unlink was too easy to trigger by accident. Same
  // inline-confirm pattern RevokeConsentSection already uses.
  if (unlinkConfirm.isConfirming) {
    return (
      <Card size="md" className={className} tone="brand-tint">
        <div ref={unlinkConfirm.confirmRef} tabIndex={-1} className="outline-none">
          <p className="text-label text-ink-2">
            Tem certeza? Você deixa de aparecer nos números do seu time até vincular de novo.
          </p>
          <div className="mt-3 flex gap-3">
            <Button variant="outline" full={false} className="flex-1" onClick={unlinkConfirm.cancel}>
              Cancelar
            </Button>
            <Button variant="danger" full={false} className="flex-1" onClick={handleUnlink}>
              Sim, desvincular
            </Button>
          </div>
        </div>
      </Card>
    );
  }

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
          ref={unlinkConfirm.triggerRef}
          variant="outline"
          full={false}
          className="md:flex-none"
          onClick={unlinkConfirm.requestConfirm}
        >
          Desvincular
        </Button>
      </div>
    </Card>
  );
}
