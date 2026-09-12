import { useAssessmentHistory } from '@/presentation/hooks/useAssessmentHistory';
import { EMPTY_POINTS } from '@/presentation/lib/home.constants';
import { mostRecentAssessmentDate } from '@/presentation/lib/weekly-history-chart';
import { ShouldShowFollowUpPromptUseCase } from '@/use-cases/should-show-followup-prompt.usecase';
import { useFollowUpStore } from '@/stores/followup.store';

const shouldShowFollowUpPromptUseCase = new ShouldShowFollowUpPromptUseCase();

// Shared by FollowUpCard (to decide what to render) and HomePage (to keep
// InstitutionLinkCard's nudge off screen right after a "não estou bem"
// disclosure) — both need the same "was this cycle already answered"
// derivation, and it has to live in one place so they can't drift apart.
export function useFollowUpAnswer() {
  const { data: history, isLoading } = useAssessmentHistory();
  const answer = useFollowUpStore((state) => state.answer);
  const answeredAt = useFollowUpStore((state) => state.answeredAt);
  const recordAnswer = useFollowUpStore((state) => state.recordAnswer);

  const mostRecentAssessmentAt = mostRecentAssessmentDate(history ?? EMPTY_POINTS);
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

  return { isLoading, answer, answeredThisCycle, shouldShowPrompt, recordAnswer };
}
