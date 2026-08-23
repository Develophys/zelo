import { describe, expect, it } from "vitest";
import { SweepNotificationRetentionUseCase } from "./sweep-notification-retention.use-case.ts";

function buildWithCapturedCutoff(returning: number) {
  let received: Date | null = null;
  const useCase = new SweepNotificationRetentionUseCase({
    deleteReadOlderThan: async (cutoff: Date) => {
      received = cutoff;
      return returning;
    },
  } as never);
  return { useCase, getCutoff: () => received };
}

describe("SweepNotificationRetentionUseCase", () => {
  it("purges read notifications older than the retention window", async () => {
    const { useCase, getCutoff } = buildWithCapturedCutoff(7);

    const deleted = await useCase.execute(new Date("2026-08-23T03:00:00.000Z"));

    expect(deleted).toBe(7);
    // 90 days before 2026-08-23 — computed independently of the implementation's
    // own setUTCDate arithmetic, so a sign flip, off-by-one, or a swap to the
    // local-time setDate would actually fail this.
    expect(getCutoff()!.toISOString()).toBe("2026-05-25T03:00:00.000Z");
  });

  it("crosses a year boundary correctly", async () => {
    const { useCase, getCutoff } = buildWithCapturedCutoff(3);

    await useCase.execute(new Date("2026-02-15T03:00:00.000Z"));

    // 90 days before 2026-02-15 lands in the previous year, through a
    // non-leap February — the arithmetic most likely to go wrong.
    expect(getCutoff()!.toISOString()).toBe("2025-11-17T03:00:00.000Z");
  });
});
