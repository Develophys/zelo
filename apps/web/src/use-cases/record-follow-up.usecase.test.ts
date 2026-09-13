import { describe, expect, it } from "vitest";
import { RecordFollowUpUseCase } from "./record-follow-up.usecase";
import type { SignalFollowUpParams, SignalCheckinPort } from "@/ports/signal-checkin.port";

class FakeSignalCheckinPort implements SignalCheckinPort {
  public followUpCalls: SignalFollowUpParams[] = [];
  async checkin(): Promise<void> {
    throw new Error("not used in this test");
  }
  async abandon(): Promise<void> {
    throw new Error("not used in this test");
  }
  async chatDraft(): Promise<void> {
    throw new Error("not used in this test");
  }
  async followUp(params: SignalFollowUpParams): Promise<void> {
    this.followUpCalls.push(params);
  }
}

describe("RecordFollowUpUseCase", () => {
  it("does nothing when there is no institution link", async () => {
    const port = new FakeSignalCheckinPort();
    const useCase = new RecordFollowUpUseCase(port);

    await useCase.execute({ link: null, event: "sent" });

    expect(port.followUpCalls).toHaveLength(0);
  });

  it("calls the port with the link's fields and the event, when a link exists", async () => {
    const port = new FakeSignalCheckinPort();
    const useCase = new RecordFollowUpUseCase(port);

    await useCase.execute({
      link: { institutionId: "inst-1", sectorId: "UTI", deviceSignalId: "device-1" },
      event: "answered",
    });

    expect(port.followUpCalls).toEqual([
      { institutionId: "inst-1", sectorId: "UTI", deviceSignalId: "device-1", event: "answered" },
    ]);
  });

  it("propagates a port failure (the caller decides whether to swallow it)", async () => {
    class ThrowingPort implements SignalCheckinPort {
      async checkin(): Promise<void> {
        throw new Error("not used in this test");
      }
      async abandon(): Promise<void> {
        throw new Error("not used in this test");
      }
      async chatDraft(): Promise<void> {
        throw new Error("not used in this test");
      }
      async followUp(): Promise<void> {
        throw new Error("network down");
      }
    }
    const useCase = new RecordFollowUpUseCase(new ThrowingPort());

    await expect(
      useCase.execute({
        link: { institutionId: "inst-1", sectorId: "UTI", deviceSignalId: "device-1" },
        event: "sent",
      }),
    ).rejects.toThrow("network down");
  });
});
