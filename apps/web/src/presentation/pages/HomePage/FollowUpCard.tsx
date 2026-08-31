import { Button } from '@/presentation/ui/Button';
import { Card } from '@/presentation/ui/Card';
import { useAssessmentHistory } from '@/presentation/hooks/useAssessmentHistory';
import { EMPTY_POINTS } from '@/presentation/lib/home.constants';
import { mostRecentAssessmentDate } from '@/presentation/lib/weekly-history-chart';
import { ShouldShowFollowUpPromptUseCase } from '@/use-cases/should-show-followup-prompt.usecase';
import { useFollowUpStore } from '@/stores/followup.store';

const shouldShowFollowUpPromptUseCase = new ShouldShowFollowUpPromptUseCase();

interface FollowUpCardProps {
  className?: string;
}

export function FollowUpCard({ className = '' }: FollowUpCardProps) {
  const { data: history } = useAssessmentHistory();
  const answer = useFollowUpStore((state) => state.answer);
  const recordAnswer = useFollowUpStore((state) => state.recordAnswer);

  const shouldShow = shouldShowFollowUpPromptUseCase.execute({
    mostRecentAssessmentAt: mostRecentAssessmentDate(history ?? EMPTY_POINTS),
    alreadyAnswered: answer !== null,
    now: new Date(),
  });

  if (!shouldShow) {
    return null;
  }

  return (
    <div className={className}>
      <Card>
        <p className="text-body font-extrabold text-ink">Como você está, um tempo depois?</p>
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
