import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { RecordFollowUpUseCase } from "./record-follow-up.use-case.ts";
import type {
  RecordSignalIncrementParams,
  SignalCheckinRepository,
  SignalCounters,
} from "../ports/signal-checkin-repository.port.ts";

const ZERO_COUNTERS: SignalCounters = {
  checkIns: 0,
  concerning: 0,
  abandoned: 0,
  unsentChatDrafts: 0,
  followUpSent: 0,
  followUpAnswered: 0,
};

class FakeSignalCheckinRepository implements SignalCheckinRepository {
  public calls: RecordSignalIncrementParams[] = [];
  async recordIncrement(params: RecordSignalIncrementParams): Promise<SignalCounters | null> {
    this.calls.push(params);
    return ZERO_COUNTERS;
  }
}

describe("RecordFollowUpUseCase", () => {
  it("increments followUpSent for a 'sent' event, with a dedupKey namespaced by event and week", async () => {
    const repository = new FakeSignalCheckinRepository();
    const useCase = new RecordFollowUpUseCase(repository);
    const now = new Date("2026-06-17T10:00:00.000Z"); // a Wednesday

    await useCase.execute(
      { institutionId: "institution-1", sectorId: "sector-1", deviceSignalId: "device-1", event: "sent" },
      now,
    );

    expect(repository.calls[0]).toEqual({
      institutionId: "institution-1",
      sectorId: "sector-1",
      weekStart: new Date("2026-06-15T00:00:00.000Z"), // Monday of that week
      dedupKey: expect.any(String),
      increments: { followUpSent: 1 },
    });
  });

  it("increments followUpAnswered for an 'answered' event", async () => {
    const repository = new FakeSignalCheckinRepository();
    const useCase = new RecordFollowUpUseCase(repository);
    const now = new Date("2026-06-17T10:00:00.000Z");

    await useCase.execute(
      { institutionId: "institution-1", sectorId: "sector-1", deviceSignalId: "device-1", event: "answered" },
      now,
    );

    expect(repository.calls[0]!.increments).toEqual({ followUpAnswered: 1 });
  });

  it("produces different dedupKeys for 'sent' and 'answered' on the same device/institution/sector/week", async () => {
    const repository = new FakeSignalCheckinRepository();
    const useCase = new RecordFollowUpUseCase(repository);
    const now = new Date("2026-06-17T10:00:00.000Z");

    await useCase.execute(
      { institutionId: "institution-1", sectorId: "sector-1", deviceSignalId: "device-1", event: "sent" },
      now,
    );
    await useCase.execute(
      { institutionId: "institution-1", sectorId: "sector-1", deviceSignalId: "device-1", event: "answered" },
      now,
    );

    expect(repository.calls[0]!.dedupKey).not.toBe(repository.calls[1]!.dedupKey);
  });

  it("produces a dedupKey different from a check-in's or a chat-draft's, for the same device/institution/sector/week", async () => {
    const repository = new FakeSignalCheckinRepository();
    const useCase = new RecordFollowUpUseCase(repository);
    const now = new Date("2026-06-17T10:00:00.000Z");

    await useCase.execute(
      { institutionId: "institution-1", sectorId: "sector-1", deviceSignalId: "device-1", event: "sent" },
      now,
    );

    const checkinStyleDedupKey = createHash("sha256")
      .update("device-1:institution-1:sector-1:2026-06-15T00:00:00.000Z")
      .digest("hex");
    const chatDraftStyleDedupKey = createHash("sha256")
      .update("chat-draft:device-1:institution-1:sector-1:2026-06-15T00:00:00.000Z")
      .digest("hex");

    expect(repository.calls[0]!.dedupKey).not.toBe(checkinStyleDedupKey);
    expect(repository.calls[0]!.dedupKey).not.toBe(chatDraftStyleDedupKey);
  });
});
