import { useAssessmentHistory } from '@/presentation/hooks/useAssessmentHistory';
import { EMPTY_POINTS } from '@/presentation/lib/home.constants';
import { bandForSeverityFraction } from '@/presentation/lib/band-for';
import { mostRecentAssessmentPoint } from '@/presentation/lib/weekly-history-chart';
import { ShouldShowFollowUpPromptUseCase } from '@/use-cases/should-show-followup-prompt.usecase';
import { useFollowUpStore } from '@/stores/followup.store';

const shouldShowFollowUpPromptUseCase = new ShouldShowFollowUpPromptUseCase();

// "Obrigado por dizer" reads as stale days later, and it was silently overriding InstitutionLinkCard's own 2-day snooze until then.
export const ACKNOWLEDGMENT_WINDOW_HOURS = 24;

// Shared by FollowUpCard and HomePage so their "was this cycle already answered" derivation can't drift apart.
export function useFollowUpAnswer() {
  const { data: history, isLoading } = useAssessmentHistory();
  const answer = useFollowUpStore((state) => state.answer);
  const answeredAt = useFollowUpStore((state) => state.answeredAt);
  const recordAnswer = useFollowUpStore((state) => state.recordAnswer);

  const mostRecentPoint = mostRecentAssessmentPoint(history ?? EMPTY_POINTS);
  const mostRecentAssessmentAt = mostRecentPoint ? new Date(mostRecentPoint.weekStart) : null;
  const answeredAtDate = answeredAt ? new Date(answeredAt) : null;

  // Derived from persisted answeredAt so it survives a remount (reload, PWA eviction) instead of vanishing.
  const answeredThisCycle =
    answeredAtDate !== null &&
    mostRecentAssessmentAt !== null &&
    answeredAtDate.getTime() >= mostRecentAssessmentAt.getTime();

  const shouldShowPrompt = shouldShowFollowUpPromptUseCase.execute({
    mostRecentAssessmentAt,
    answeredAt: answeredAtDate,
    now: new Date(),
  });

  const answeredRecently =
    answeredAtDate !== null &&
    Date.now() - answeredAtDate.getTime() < ACKNOWLEDGMENT_WINDOW_HOURS * 60 * 60 * 1000;
  const showAcknowledgment = answeredThisCycle && answeredRecently;

  // A high/severe PHQ-9/GAD-7 result is a distress signal too, per PRODUCT.md — reuses the same recency window as the pulse-check ack.
  const mostRecentSeverityTone = mostRecentPoint
    ? bandForSeverityFraction(mostRecentPoint.severityFraction!).tone
    : null;
  const recentSevereAssessment =
    (mostRecentSeverityTone === 'high' || mostRecentSeverityTone === 'severe') &&
    mostRecentAssessmentAt !== null &&
    Date.now() - mostRecentAssessmentAt.getTime() < ACKNOWLEDGMENT_WINDOW_HOURS * 60 * 60 * 1000;

  return {
    isLoading,
    answer,
    showAcknowledgment,
    answeredThisCycle,
    shouldShowPrompt,
    recordAnswer,
    recentSevereAssessment,
  };
}
