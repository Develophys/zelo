// Deliberately short: this nudge is housekeeping for the institution's
// aggregate, not something the médico came to the app for (see HomePage's
// own card-ordering comment). A doctor who taps "Agora não" gets a real
// couple of days of quiet rather than the nudge reappearing on the very
// next visit, but it is not suppressed for weeks — unlike the followup
// prompt (FOLLOWUP_INTERVAL_DAYS), which is about the doctor's wellbeing
// and therefore keeps a longer, more deliberate interval. Chosen 2026-09-12
// in response to the /impeccable critique P2 finding on HomePage.tsx.
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
