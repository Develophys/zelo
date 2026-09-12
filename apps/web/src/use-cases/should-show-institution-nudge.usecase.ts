// Deliberately shorter than FOLLOWUP_INTERVAL_DAYS — this nudge is institution housekeeping, not the doctor's own wellbeing.
export const INSTITUTION_NUDGE_SNOOZE_DAYS = 2;

export interface ShouldShowInstitutionNudgeInput {
  dismissedAt: Date | null;
  now: Date;
}

export class ShouldShowInstitutionNudgeUseCase {
  execute({ dismissedAt, now }: ShouldShowInstitutionNudgeInput): boolean {
    if (dismissedAt === null) return true;

    const elapsedMs = now.getTime() - dismissedAt.getTime();
    const elapsedDays = elapsedMs / (1000 * 60 * 60 * 24);
    return elapsedDays >= INSTITUTION_NUDGE_SNOOZE_DAYS;
  }
}
