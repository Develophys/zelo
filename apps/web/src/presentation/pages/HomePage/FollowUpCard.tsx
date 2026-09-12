import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/presentation/ui/Button';
import { routes } from '@/presentation/lib/routes';
import { Card } from '@/presentation/ui/Card';
import { useFollowUpAnswer } from '@/presentation/hooks/useFollowUpAnswer';

interface FollowUpCardProps {
  className?: string;
}

export function FollowUpCard({ className = '' }: FollowUpCardProps) {
  const navigate = useNavigate();
  const { isLoading, answer, showAcknowledgment, shouldShowPrompt, recordAnswer } = useFollowUpAnswer();
  const ackRef = useRef<HTMLDivElement>(null);
  // Only this mount's own click sets this — a remount showing a persisted ack shouldn't steal focus.
  const [justAnswered, setJustAnswered] = useState(false);

  useEffect(() => {
    if (!justAnswered) {
      return;
    }
    ackRef.current?.focus();
    setJustAnswered(false);
  }, [justAnswered]);

  const handleAnswer = (value: 'yes' | 'no') => {
    recordAnswer(value);
    setJustAnswered(true);
  };

  // No loading skeleton: most visits need no prompt at all, so a placeholder would just collapse and shift content.
  if (isLoading) {
    return null;
  }

  // Replaces the question in place rather than unmounting it — answering "não" shouldn't make it vanish with no response.
  if (showAcknowledgment) {
    return (
      <div className={className} role="status" aria-live="polite" aria-atomic="true">
        <Card data-testid="followup-ack" tone={answer === 'no' ? 'brand-tint' : undefined}>
          <div ref={ackRef} tabIndex={-1}>
          {answer === 'no' ? (
            <>
              <p className="text-body font-extrabold text-ink">Obrigado por dizer.</p>
              {/* "Conversar com o acolhimento", not "Falar com alguém" — that phrase already means the human/crisis path elsewhere in the app. */}
              <p className="mt-1 text-pretty text-caption text-muted">
                Não precisa carregar isso sozinho(a).{' '}
                <Button
                  variant="unstyled"
                  full={false}
                  className="font-semibold text-brand underline underline-offset-2 hover:text-brand-hover"
                  onClick={() => navigate(routes.chat)}
                >
                  Conversar com o acolhimento
                </Button>{' '}
                costuma ajudar mais do que esperar passar.
              </p>
            </>
          ) : (
            <>
              <p className="text-body font-extrabold text-ink">Que bom saber.</p>
              <p className="mt-1 text-caption text-muted">
                Se mudar, o check-in e a conversa continuam aqui.
              </p>
            </>
          )}
          </div>
        </Card>
      </div>
    );
  }

  if (!shouldShowPrompt) {
    return null;
  }

  return (
    <div className={className} role="status" aria-live="polite" aria-atomic="true">
      <Card>
        {/* Not "Como você está...?" — CheckInHeroCard already asks that for the full assessment. */}
        <p className="text-body font-extrabold text-ink">Só uma checagem rápida: tudo bem?</p>
        <div className="mt-3 flex gap-3">
          <Button variant="outline" full={false} onClick={() => handleAnswer('yes')}>
            Estou bem
          </Button>
          <Button variant="outline" full={false} onClick={() => handleAnswer('no')}>
            Não estou bem
          </Button>
        </div>
      </Card>
    </div>
  );
}
