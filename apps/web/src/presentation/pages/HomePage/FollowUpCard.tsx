import { useNavigate } from 'react-router';
import { Button } from '@/presentation/ui/Button';
import { routes } from '@/presentation/lib/routes';
import { Card } from '@/presentation/ui/Card';
import { Skeleton } from '@/presentation/ui/Skeleton';
import { useFollowUpAnswer } from '@/presentation/hooks/useFollowUpAnswer';

interface FollowUpCardProps {
  className?: string;
}

export function FollowUpCard({ className = '' }: FollowUpCardProps) {
  const navigate = useNavigate();
  const { isLoading, answer, answeredThisCycle, shouldShowPrompt, recordAnswer } =
    useFollowUpAnswer();

  if (isLoading) {
    // Without a reserved height, the card pops in once history resolves and
    // shifts everything below it — including the contact tiles a one-handed
    // user may already be tapping moments after first paint.
    return (
      <div className={className} data-testid="followup-skeleton">
        <Card>
          <Skeleton className="h-5 w-3/4 rounded" />
          <div className="mt-3 flex gap-3">
            <Skeleton className="h-11 w-24 rounded-control" />
            <Skeleton className="h-11 w-32 rounded-control" />
          </div>
        </Card>
      </div>
    );
  }

  // Answering used to unmount the card outright. Someone who had just said they
  // were not okay watched the question disappear and nothing happen — the one
  // interaction most likely to teach a doctor that this app does not listen.
  // The acknowledgement replaces the question in place instead.
  //
  // Derived from answeredThisCycle (backed by the persisted answeredAt), not
  // local component state — a remount right after answering (a reload, a PWA
  // background-eviction) must still show this, not silently render nothing.
  if (answeredThisCycle) {
    return (
      <div className={className} role="status" aria-live="polite" aria-atomic="true">
        <Card data-testid="followup-ack" tone={answer === 'no' ? 'brand-tint' : undefined}>
          {answer === 'no' ? (
            <>
              <p className="text-body font-extrabold text-ink">Obrigado por dizer.</p>
              {/* No longer repeats "Conversar agora"/"Falar com um par" as
                  buttons here — that accented row sits right below on Home,
                  so restating it in a different shape was the same action
                  shown twice at the one moment composure matters most. The
                  promise still needs its own affordance, though: proximity
                  to the row below breaks under scroll, zoom or a short
                  viewport, so this is a real link, not just words pointing
                  downward. Labeled "Conversar com o acolhimento" (reusing
                  AssessmentResultPage's own label for this exact chat
                  destination), not "Falar com alguém" — that phrase already
                  means the human/crisis path elsewhere in this app
                  (CrisisOfferPage, ChatActionTray), so reusing it for the AI
                  route here would silently promise a person, right after
                  someone has just said they're not okay. */}
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
        {/* Deliberately not "Como você está...?" — CheckInHeroCard already asks
            that for the full 5-minute assessment; echoing it here read as the
            same question restated for a 1-tap pulse check. */}
        <p className="text-body font-extrabold text-ink">Só uma checagem rápida: tudo bem?</p>
        <div className="mt-3 flex gap-3">
          <Button variant="outline" full={false} onClick={() => recordAnswer('yes')}>
            Estou bem
          </Button>
          <Button variant="outline" full={false} onClick={() => recordAnswer('no')}>
            Não estou bem
          </Button>
        </div>
      </Card>
    </div>
  );
}
