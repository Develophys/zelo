// Resolves US-009's follow-up interval; see docs/superpowers/specs/2026-07-19-followup-mechanism-design.md §5.
export const FOLLOWUP_INTERVAL_DAYS = 3;

export interface ShouldShowFollowUpPromptInput {
  mostRecentAssessmentAt: Date | null;
  answeredAt: Date | null;
  now: Date;
}

export class ShouldShowFollowUpPromptUseCase {
  execute({ mostRecentAssessmentAt, answeredAt, now }: ShouldShowFollowUpPromptInput): boolean {
    if (mostRecentAssessmentAt === null) return false;

    // Only suppresses for the cycle it answered — otherwise one tap would retire the prompt forever.
    const answeredThisCycle =
      answeredAt !== null && answeredAt.getTime() >= mostRecentAssessmentAt.getTime();
    if (answeredThisCycle) return false;

    const elapsedMs = now.getTime() - mostRecentAssessmentAt.getTime();
    const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);
    return elapsedDays >= FOLLOWUP_INTERVAL_DAYS;
  }
}
