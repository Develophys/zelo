import { useAssessmentHistory } from '@/presentation/hooks/useAssessmentHistory';
import { EMPTY_POINTS } from '@/presentation/lib/home.constants';
import { bandForSeverityFraction } from '@/presentation/lib/band-for';
import { mostRecentAssessmentPoint } from '@/presentation/lib/weekly-history-chart';
import { ShouldShowFollowUpPromptUseCase } from '@/use-cases/should-show-followup-prompt.usecase';
import { useFollowUpStore } from '@/stores/followup.store';

const shouldShowFollowUpPromptUseCase = new ShouldShowFollowUpPromptUseCase();

// "Obrigado por dizer." read days later as stale rather than caring, and its
// nudge-suppression side effect silently overrode InstitutionLinkCard's own
// tuned 2-day snooze for that whole span. 24h keeps it visible for the rest
// of the day it was said (including a doctor checking back mid-shift) while
// guaranteeing it's gone well before a "days later" revisit — independent of
// answeredThisCycle, which still correctly keeps the question itself from
// re-appearing until a brand new assessment cycle.
export const ACKNOWLEDGMENT_WINDOW_HOURS = 24;

// Shared by FollowUpCard (to decide what to render) and HomePage (to keep
// InstitutionLinkCard's nudge off screen right after a "não estou bem"
// disclosure) — both need the same "was this cycle already answered"
// derivation, and it has to live in one place so they can't drift apart.
export function useFollowUpAnswer() {
  const { data: history, isLoading } = useAssessmentHistory();
  const answer = useFollowUpStore((state) => state.answer);
  const answeredAt = useFollowUpStore((state) => state.answeredAt);
  const recordAnswer = useFollowUpStore((state) => state.recordAnswer);

  const mostRecentPoint = mostRecentAssessmentPoint(history ?? EMPTY_POINTS);
  const mostRecentAssessmentAt = mostRecentPoint ? new Date(mostRecentPoint.weekStart) : null;
  const answeredAtDate = answeredAt ? new Date(answeredAt) : null;

  // Derived from persisted state (answeredAt), not local component state, so
  // the answer — and whatever UI it drives — survives a remount (a reload, a
  // PWA background-eviction) instead of vanishing with no trace.
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

  // The pulse-check "não" is one distress signal; the assessment itself —
  // PHQ-9/GAD-7, this app's authoritative one per PRODUCT.md — is another,
  // and the institution nudge has to stay off screen for either. Reuses
  // ACKNOWLEDGMENT_WINDOW_HOURS rather than a separate constant: the same
  // "recent enough to still matter" cutoff already tuned for the pulse-check
  // disclosure applies just as well to a fresh severe reading.
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
