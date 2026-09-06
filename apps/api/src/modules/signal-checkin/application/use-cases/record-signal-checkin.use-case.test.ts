import { describe, expect, it } from "vitest";
import { RecordSignalCheckinUseCase } from "./record-signal-checkin.use-case.ts";
import type { RecordCheckinParams, SignalCheckinRepository } from "../ports/signal-checkin-repository.port.ts";
import type { NotificationEvent, NotificationPublisher } from "@/modules/notification/application/ports/notification.port.js";
import { K_ANONYMITY_THRESHOLD } from "@/modules/manager/application/constants.js";

class FakeSignalCheckinRepository implements SignalCheckinRepository {
  public calls: RecordCheckinParams[] = [];
  public nextResult: { checkIns: number } | null = { checkIns: 1 };
  async recordCheckin(params: RecordCheckinParams): Promise<{ checkIns: number } | null> {
    this.calls.push(params);
    return this.nextResult;
  }
}

class FakeNotificationPublisher implements NotificationPublisher {
  events: NotificationEvent[] = [];
  async publish(event: NotificationEvent): Promise<void> {
    this.events.push(event);
  }
}

describe("RecordSignalCheckinUseCase", () => {
  it("computes weekStart and a dedupKey hashing in sectorId, and forwards to the repository", async () => {
    const repository = new FakeSignalCheckinRepository();
    const notifications = new FakeNotificationPublisher();
    const useCase = new RecordSignalCheckinUseCase(repository, notifications);
    const now = new Date("2026-06-17T10:00:00.000Z"); // a Wednesday

    await useCase.execute(
      { institutionId: "institution-1", sectorId: "sector-1", concerning: true, deviceSignalId: "device-1" },
      now,
    );

    expect(repository.calls[0]).toEqual({
      institutionId: "institution-1",
      sectorId: "sector-1",
      weekStart: new Date("2026-06-15T00:00:00.000Z"), // Monday of that week
      concerning: true,
      dedupKey: expect.any(String),
    });
  });

  it("produces a different dedupKey for a different sectorId, same device/institution/week", async () => {
    const repository = new FakeSignalCheckinRepository();
    const notifications = new FakeNotificationPublisher();
    const useCase = new RecordSignalCheckinUseCase(repository, notifications);
    const now = new Date("2026-06-17T10:00:00.000Z");

    await useCase.execute({ institutionId: "institution-1", sectorId: "sector-1", concerning: false, deviceSignalId: "device-1" }, now);
    const first = repository.calls[0].dedupKey;

    await useCase.execute({ institutionId: "institution-1", sectorId: "sector-2", concerning: false, deviceSignalId: "device-1" }, now);
    const second = repository.calls[1].dedupKey;

    expect(first).not.toBe(second);
  });

  it("announces the sector becoming visible on the increment that reaches the threshold", async () => {
    const repository = new FakeSignalCheckinRepository();
    repository.nextResult = { checkIns: K_ANONYMITY_THRESHOLD };
    const notifications = new FakeNotificationPublisher();
    const useCase = new RecordSignalCheckinUseCase(repository, notifications);

    await useCase.execute(
      { institutionId: "institution-1", sectorId: "sector-1", concerning: false, deviceSignalId: "device-1" },
      new Date("2026-07-08T15:00:00.000Z"),
    );

    expect(notifications.events).toEqual([
      {
        institutionId: "institution-1",
        type: "SECTOR_BECAME_VISIBLE",
        sectorId: "sector-1",
        payload: { weekStart: "2026-07-06T00:00:00.000Z", checkIns: K_ANONYMITY_THRESHOLD },
        dedupKey: "sector-visible:sector-1:2026-07-06T00:00:00.000Z",
      },
    ]);
  });

  // checkIns only ever increases within a week, so exactly one increment can
  // equal the threshold — this is what makes the event fire once with no state.
  it.each([1, 2, 3, 4, 6, 7, 12])("stays quiet at %i check-ins", async (checkIns) => {
    const repository = new FakeSignalCheckinRepository();
    repository.nextResult = { checkIns };
    const notifications = new FakeNotificationPublisher();
    const useCase = new RecordSignalCheckinUseCase(repository, notifications);

    await useCase.execute(
      { institutionId: "institution-1", sectorId: "sector-1", concerning: false, deviceSignalId: "device-1" },
      new Date("2026-07-08T15:00:00.000Z"),
    );

    expect(notifications.events).toEqual([]);
  });

  it("fires exactly once across a whole week of check-ins", async () => {
    const repository = new FakeSignalCheckinRepository();
    const notifications = new FakeNotificationPublisher();
    const useCase = new RecordSignalCheckinUseCase(repository, notifications);

    for (let checkIns = 1; checkIns <= 12; checkIns += 1) {
      repository.nextResult = { checkIns };
      await useCase.execute(
        { institutionId: "institution-1", sectorId: "sector-1", concerning: false, deviceSignalId: `device-${checkIns}` },
        new Date("2026-07-08T15:00:00.000Z"),
      );
    }

    expect(notifications.events).toHaveLength(1);
  });

  it("stays quiet when the check-in was deduplicated", async () => {
    const repository = new FakeSignalCheckinRepository();
    repository.nextResult = null;
    const notifications = new FakeNotificationPublisher();
    const useCase = new RecordSignalCheckinUseCase(repository, notifications);

    await useCase.execute(
      { institutionId: "institution-1", sectorId: "sector-1", concerning: false, deviceSignalId: "device-1" },
      new Date("2026-07-08T15:00:00.000Z"),
    );

    expect(notifications.events).toEqual([]);
  });
});
