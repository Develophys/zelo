import { describe, expect, it } from "vitest";
import { RecordSignalCheckinUseCase } from "./record-signal-checkin.use-case.ts";
import type { RecordCheckinParams, SignalCheckinRepository } from "../ports/signal-checkin-repository.port.ts";

class FakeSignalCheckinRepository implements SignalCheckinRepository {
  public lastParams: RecordCheckinParams | null = null;
  async recordCheckin(params: RecordCheckinParams): Promise<void> {
    this.lastParams = params;
  }
}

describe("RecordSignalCheckinUseCase", () => {
  it("computes weekStart and a dedupKey hashing in sectorId, and forwards to the repository", async () => {
    const repository = new FakeSignalCheckinRepository();
    const useCase = new RecordSignalCheckinUseCase(repository);
    const now = new Date("2026-06-17T10:00:00.000Z"); // a Wednesday

    await useCase.execute(
      { institutionId: "institution-1", sectorId: "sector-1", concerning: true, deviceSignalId: "device-1" },
      now,
    );

    expect(repository.lastParams).toEqual({
      institutionId: "institution-1",
      sectorId: "sector-1",
      weekStart: new Date("2026-06-15T00:00:00.000Z"), // Monday of that week
      concerning: true,
      dedupKey: expect.any(String),
    });
  });

  it("produces a different dedupKey for a different sectorId, same device/institution/week", async () => {
    const repository = new FakeSignalCheckinRepository();
    const useCase = new RecordSignalCheckinUseCase(repository);
    const now = new Date("2026-06-17T10:00:00.000Z");

    await useCase.execute({ institutionId: "institution-1", sectorId: "sector-1", concerning: false, deviceSignalId: "device-1" }, now);
    const first = repository.lastParams!.dedupKey;

    await useCase.execute({ institutionId: "institution-1", sectorId: "sector-2", concerning: false, deviceSignalId: "device-1" }, now);
    const second = repository.lastParams!.dedupKey;

    expect(first).not.toBe(second);
  });
});
