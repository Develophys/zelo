import { describe, expect, it } from "vitest";
import { ShouldShowFollowUpPromptUseCase, FOLLOWUP_INTERVAL_DAYS } from "./should-show-followup-prompt.usecase";

describe("ShouldShowFollowUpPromptUseCase", () => {
  const useCase = new ShouldShowFollowUpPromptUseCase();
  const now = new Date("2026-07-19T12:00:00.000Z");

  it("returns false when there is no assessment yet", () => {
    expect(useCase.execute({ mostRecentAssessmentAt: null, answeredAt: null, now })).toBe(false);
  });

  it(`returns false when fewer than ${FOLLOWUP_INTERVAL_DAYS} days have passed`, () => {
    const recent = new Date(now);
    recent.setUTCDate(recent.getUTCDate() - (FOLLOWUP_INTERVAL_DAYS - 1));
    expect(useCase.execute({ mostRecentAssessmentAt: recent, answeredAt: null, now })).toBe(false);
  });

  it(`returns true when at least ${FOLLOWUP_INTERVAL_DAYS} days have passed and no answer yet`, () => {
    const old = new Date(now);
    old.setUTCDate(old.getUTCDate() - FOLLOWUP_INTERVAL_DAYS);
    expect(useCase.execute({ mostRecentAssessmentAt: old, answeredAt: null, now })).toBe(true);
  });

  it("returns false when already answered for this same assessment cycle, regardless of elapsed time", () => {
    const old = new Date(now);
    old.setUTCDate(old.getUTCDate() - FOLLOWUP_INTERVAL_DAYS - 10);
    // Answered any time at or after the assessment it responds to.
    const answeredAt = new Date(old.getTime() + 1000);
    expect(useCase.execute({ mostRecentAssessmentAt: old, answeredAt, now })).toBe(false);
  });

  // The bug this whole file used to have baked in: a boolean "already
  // answered" flag, once true, suppressed the prompt forever — even after a
  // brand-new assessment reset mostRecentAssessmentAt. The prompt exists to
  // build a habit of checking in every few days; answering it once should
  // never retire it for the rest of the install's lifetime.
  it(`re-arms after a newer assessment, ${FOLLOWUP_INTERVAL_DAYS}+ days later, even if an older answer is on record`, () => {
    const staleAnswerFromWeeksAgo = new Date(now);
    staleAnswerFromWeeksAgo.setUTCDate(staleAnswerFromWeeksAgo.getUTCDate() - 30);

    const newAssessment = new Date(now);
    newAssessment.setUTCDate(newAssessment.getUTCDate() - FOLLOWUP_INTERVAL_DAYS);

    expect(
      useCase.execute({
        mostRecentAssessmentAt: newAssessment,
        answeredAt: staleAnswerFromWeeksAgo,
        now,
      }),
    ).toBe(true);
  });

  it("does not re-arm before the interval has passed since the newer assessment, even with a stale answer", () => {
    const staleAnswerFromWeeksAgo = new Date(now);
    staleAnswerFromWeeksAgo.setUTCDate(staleAnswerFromWeeksAgo.getUTCDate() - 30);

    const newAssessment = new Date(now);
    newAssessment.setUTCDate(newAssessment.getUTCDate() - (FOLLOWUP_INTERVAL_DAYS - 1));

    expect(
      useCase.execute({
        mostRecentAssessmentAt: newAssessment,
        answeredAt: staleAnswerFromWeeksAgo,
        now,
      }),
    ).toBe(false);
  });
});
