import { describe, expect, it } from "vitest";
import {
  ShouldShowInstitutionNudgeUseCase,
  INSTITUTION_NUDGE_SNOOZE_DAYS,
} from "./should-show-institution-nudge.usecase";

describe("ShouldShowInstitutionNudgeUseCase", () => {
  const useCase = new ShouldShowInstitutionNudgeUseCase();
  const now = new Date("2026-07-19T12:00:00.000Z");

  it("returns true when never dismissed", () => {
    expect(useCase.execute({ dismissedAt: null, now })).toBe(true);
  });

  it(`returns false when fewer than ${INSTITUTION_NUDGE_SNOOZE_DAYS} days have passed since dismissal`, () => {
    const recent = new Date(now);
    recent.setUTCDate(recent.getUTCDate() - (INSTITUTION_NUDGE_SNOOZE_DAYS - 1));
    expect(useCase.execute({ dismissedAt: recent, now })).toBe(false);
  });

  it(`returns true once ${INSTITUTION_NUDGE_SNOOZE_DAYS} days have passed since dismissal`, () => {
    const old = new Date(now);
    old.setUTCDate(old.getUTCDate() - INSTITUTION_NUDGE_SNOOZE_DAYS);
    expect(useCase.execute({ dismissedAt: old, now })).toBe(true);
  });
});
