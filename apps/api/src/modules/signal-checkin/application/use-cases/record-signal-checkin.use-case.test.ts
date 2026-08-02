import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { RecordSignalCheckinUseCase } from "./record-signal-checkin.use-case.ts";
import type { RecordCheckinParams, SignalCheckinRepository } from "../ports/signal-checkin-repository.port.ts";

class FakeSignalCheckinRepository implements SignalCheckinRepository {
  public lastParams: RecordCheckinParams | null = null;
  async recordCheckin(params: RecordCheckinParams): Promise<void> {
    this.lastParams = params;
  }
}

const MONDAY = new Date("2026-07-06T00:00:00.000Z");
const WEDNESDAY_SAME_WEEK = new Date("2026-07-08T15:00:00.000Z");
const NEXT_MONDAY = new Date("2026-07-13T00:00:00.000Z");

describe("RecordSignalCheckinUseCase", () => {
  it("computes weekStart as the Monday of the given date and forwards institutionId/department/concerning", async () => {
    const repository = new FakeSignalCheckinRepository();
    const useCase = new RecordSignalCheckinUseCase(repository);

    await useCase.execute(
      { institutionId: "inst-1", department: "UTI", concerning: true, deviceSignalId: "device-1" },
      WEDNESDAY_SAME_WEEK,
    );

    expect(repository.lastParams).toMatchObject({
      institutionId: "inst-1",
      department: "UTI",
      concerning: true,
      weekStart: MONDAY,
    });
  });

  it("produces a deterministic dedupKey for the same inputs", async () => {
    const repository = new FakeSignalCheckinRepository();
    const useCase = new RecordSignalCheckinUseCase(repository);
    const input = { institutionId: "inst-1", department: "UTI", concerning: false, deviceSignalId: "device-1" };

    await useCase.execute(input, WEDNESDAY_SAME_WEEK);
    const firstKey = repository.lastParams!.dedupKey;

    await useCase.execute(input, WEDNESDAY_SAME_WEEK);
    const secondKey = repository.lastParams!.dedupKey;

    const expectedKey = createHash("sha256")
      .update(`device-1:inst-1:UTI:${MONDAY.toISOString()}`)
      .digest("hex");
    expect(firstKey).toBe(expectedKey);
    expect(secondKey).toBe(expectedKey);
  });

  it("produces a different dedupKey for a different week, same device/institution/department", async () => {
    const repository = new FakeSignalCheckinRepository();
    const useCase = new RecordSignalCheckinUseCase(repository);
    const input = { institutionId: "inst-1", department: "UTI", concerning: false, deviceSignalId: "device-1" };

    await useCase.execute(input, WEDNESDAY_SAME_WEEK);
    const weekOneKey = repository.lastParams!.dedupKey;

    await useCase.execute(input, NEXT_MONDAY);
    const weekTwoKey = repository.lastParams!.dedupKey;

    expect(weekOneKey).not.toBe(weekTwoKey);
  });

  it("produces a different dedupKey for a different deviceSignalId, same everything else", async () => {
    const repository = new FakeSignalCheckinRepository();
    const useCase = new RecordSignalCheckinUseCase(repository);

    await useCase.execute(
      { institutionId: "inst-1", department: "UTI", concerning: false, deviceSignalId: "device-1" },
      WEDNESDAY_SAME_WEEK,
    );
    const deviceOneKey = repository.lastParams!.dedupKey;

    await useCase.execute(
      { institutionId: "inst-1", department: "UTI", concerning: false, deviceSignalId: "device-2" },
      WEDNESDAY_SAME_WEEK,
    );
    const deviceTwoKey = repository.lastParams!.dedupKey;

    expect(deviceOneKey).not.toBe(deviceTwoKey);
  });
});
