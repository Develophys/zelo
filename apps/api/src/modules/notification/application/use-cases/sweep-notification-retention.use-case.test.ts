import { describe, expect, it } from "vitest";
import { SweepNotificationRetentionUseCase } from "./sweep-notification-retention.use-case.ts";
import { RETENTION_DAYS } from "../thresholds.ts";

describe("SweepNotificationRetentionUseCase", () => {
  it("purges read notifications older than the retention window", async () => {
    let received: Date | null = null;
    const useCase = new SweepNotificationRetentionUseCase({
      deleteReadOlderThan: async (cutoff: Date) => {
        received = cutoff;
        return 7;
      },
    } as never);

    const deleted = await useCase.execute(new Date("2026-08-23T03:00:00.000Z"));

    expect(deleted).toBe(7);
    const expected = new Date("2026-08-23T03:00:00.000Z");
    expected.setUTCDate(expected.getUTCDate() - RETENTION_DAYS);
    expect(received!.toISOString()).toBe(expected.toISOString());
  });
});
