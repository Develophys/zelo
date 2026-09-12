// Resolves US-009's open question (exact follow-up interval) for the hackathon PoC —
// see docs/superpowers/specs/2026-07-19-followup-mechanism-design.md §5 for why 3 days.
export const FOLLOWUP_INTERVAL_DAYS = 3;

export interface ShouldShowFollowUpPromptInput {
  mostRecentAssessmentAt: Date | null;
  answeredAt: Date | null;
  now: Date;
}

export class ShouldShowFollowUpPromptUseCase {
  execute({ mostRecentAssessmentAt, answeredAt, now }: ShouldShowFollowUpPromptInput): boolean {
    if (mostRecentAssessmentAt === null) return false;

    // A recorded answer only suppresses the prompt for the assessment cycle
    // it actually responded to. Without this, a boolean "already answered"
    // would retire the prompt forever after a single tap, even once a brand
    // new assessment — the thing the interval is timed from — has happened.
    const answeredThisCycle =
      answeredAt !== null && answeredAt.getTime() >= mostRecentAssessmentAt.getTime();
    if (answeredThisCycle) return false;

    const elapsedMs = now.getTime() - mostRecentAssessmentAt.getTime();
    const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);
    return elapsedDays >= FOLLOWUP_INTERVAL_DAYS;
  }
}
