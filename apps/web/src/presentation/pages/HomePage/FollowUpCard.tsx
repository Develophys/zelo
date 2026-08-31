import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button } from '@/presentation/ui/Button';
import { Card } from '@/presentation/ui/Card';
import { useAssessmentHistory } from '@/presentation/hooks/useAssessmentHistory';
import { EMPTY_POINTS } from '@/presentation/lib/home.constants';
import { routes } from '@/presentation/lib/routes';
import { mostRecentAssessmentDate } from '@/presentation/lib/weekly-history-chart';
import { ShouldShowFollowUpPromptUseCase } from '@/use-cases/should-show-followup-prompt.usecase';
import { useFollowUpStore } from '@/stores/followup.store';

const shouldShowFollowUpPromptUseCase = new ShouldShowFollowUpPromptUseCase();

interface FollowUpCardProps {
  className?: string;
}

export function FollowUpCard({ className = '' }: FollowUpCardProps) {
  const navigate = useNavigate();
  const { data: history } = useAssessmentHistory();
  const recordAnswer = useFollowUpStore((state) => state.recordAnswer);
  const answer = useFollowUpStore((state) => state.answer);
  // Scoped to this mount on purpose. The persisted answer is what suppresses
  // the prompt on a later visit; this is only the immediate reply to the tap,
  // so returning to Home later does not re-open a conversation already had.
  const [justAnswered, setJustAnswered] = useState<'yes' | 'no' | null>(null);

  const answerAndAcknowledge = (value: 'yes' | 'no') => {
    recordAnswer(value);
    setJustAnswered(value);
  };

  const shouldShow = shouldShowFollowUpPromptUseCase.execute({
    mostRecentAssessmentAt: mostRecentAssessmentDate(history ?? EMPTY_POINTS),
    alreadyAnswered: answer !== null,
    now: new Date(),
  });

  // Answering used to unmount the card outright. Someone who had just said they
  // were not okay watched the question disappear and nothing happen — the one
  // interaction most likely to teach a doctor that this app does not listen.
  // The acknowledgement replaces the question in place instead.
  if (justAnswered) {
    return (
      <div className={className}>
        <Card data-testid="followup-ack" tone={justAnswered === 'no' ? 'brand-tint' : undefined}>
          {justAnswered === 'no' ? (
            <>
              <p className="text-body font-extrabold text-ink">Obrigado por dizer.</p>
              <p className="mt-1 text-pretty text-caption text-muted">
                Não precisa carregar isso sozinho(a). Falar com alguém costuma ajudar mais do que
                esperar passar.
              </p>
              <div className="mt-4 flex flex-col gap-3 md:flex-row">
                <Button variant="primary" full={false} onClick={() => navigate(routes.chat)}>
                  Conversar agora
                </Button>
                <Button variant="outline" full={false} onClick={() => navigate(routes.peers)}>
                  Falar com um par
                </Button>
              </div>
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

  if (!shouldShow) {
    return null;
  }

  return (
    <div className={className}>
      <Card>
        <p className="text-body font-extrabold text-ink">Como você está, um tempo depois?</p>
        <div className="mt-3 flex gap-3">
          <Button variant="outline" full={false} onClick={() => answerAndAcknowledge('yes')}>
            Estou bem
          </Button>
          <Button variant="outline" full={false} onClick={() => answerAndAcknowledge('no')}>
            Não estou bem
          </Button>
        </div>
      </Card>
    </div>
  );
}
