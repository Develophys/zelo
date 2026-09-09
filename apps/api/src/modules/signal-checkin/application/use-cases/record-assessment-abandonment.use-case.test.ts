import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { RecordAssessmentAbandonmentUseCase } from "./record-assessment-abandonment.use-case.ts";
import type { RecordAbandonmentParams, SignalCheckinRepository } from "../ports/signal-checkin-repository.port.ts";

class FakeSignalCheckinRepository implements SignalCheckinRepository {
  public abandonCalls: RecordAbandonmentParams[] = [];
  async recordCheckin(): Promise<{ checkIns: number } | null> {
    throw new Error("not used in this test");
  }
  async recordAbandonment(params: RecordAbandonmentParams): Promise<{ abandoned: number } | null> {
    this.abandonCalls.push(params);
    return { abandoned: 1 };
  }
}

describe("RecordAssessmentAbandonmentUseCase", () => {
  it("computes weekStart and an 'abandon:'-prefixed dedupKey, and forwards to the repository", async () => {
    const repository = new FakeSignalCheckinRepository();
    const useCase = new RecordAssessmentAbandonmentUseCase(repository);
    const now = new Date("2026-06-17T10:00:00.000Z"); // a Wednesday

    await useCase.execute(
      { institutionId: "institution-1", sectorId: "sector-1", deviceSignalId: "device-1" },
      now,
    );

    expect(repository.abandonCalls[0]).toEqual({
      institutionId: "institution-1",
      sectorId: "sector-1",
      weekStart: new Date("2026-06-15T00:00:00.000Z"), // Monday of that week
      dedupKey: expect.any(String),
    });
  });

  it("produces a dedupKey different from a check-in's, for the same device/institution/sector/week", async () => {
    const repository = new FakeSignalCheckinRepository();
    const useCase = new RecordAssessmentAbandonmentUseCase(repository);
    const now = new Date("2026-06-17T10:00:00.000Z");

    await useCase.execute({ institutionId: "institution-1", sectorId: "sector-1", deviceSignalId: "device-1" }, now);

    const checkinStyleDedupKey = createHash("sha256")
      .update("device-1:institution-1:sector-1:2026-06-15T00:00:00.000Z")
      .digest("hex");

    expect(repository.abandonCalls[0]!.dedupKey).not.toBe(checkinStyleDedupKey);
  });

  it("produces a different dedupKey for a different sectorId, same device/institution/week", async () => {
    const repository = new FakeSignalCheckinRepository();
    const useCase = new RecordAssessmentAbandonmentUseCase(repository);
    const now = new Date("2026-06-17T10:00:00.000Z");

    await useCase.execute({ institutionId: "institution-1", sectorId: "sector-1", deviceSignalId: "device-1" }, now);
    const first = repository.abandonCalls[0]!.dedupKey;

    await useCase.execute({ institutionId: "institution-1", sectorId: "sector-2", deviceSignalId: "device-1" }, now);
    const second = repository.abandonCalls[1]!.dedupKey;

    expect(first).not.toBe(second);
  });
});
