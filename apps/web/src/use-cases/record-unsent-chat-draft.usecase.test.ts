import { describe, expect, it } from "vitest";
import { RecordUnsentChatDraftUseCase } from "./record-unsent-chat-draft.usecase";
import type { SignalChatDraftParams, SignalCheckinPort } from "@/ports/signal-checkin.port";

class FakeSignalCheckinPort implements SignalCheckinPort {
  public chatDraftCalls: SignalChatDraftParams[] = [];
  async checkin(): Promise<void> {
    throw new Error("not used in this test");
  }
  async abandon(): Promise<void> {
    throw new Error("not used in this test");
  }
  async chatDraft(params: SignalChatDraftParams): Promise<void> {
    this.chatDraftCalls.push(params);
  }
}

describe("RecordUnsentChatDraftUseCase", () => {
  it("does nothing when there is no institution link", async () => {
    const port = new FakeSignalCheckinPort();
    const useCase = new RecordUnsentChatDraftUseCase(port);

    await useCase.execute({ link: null });

    expect(port.chatDraftCalls).toHaveLength(0);
  });

  it("calls the port with the link's fields, when a link exists", async () => {
    const port = new FakeSignalCheckinPort();
    const useCase = new RecordUnsentChatDraftUseCase(port);

    await useCase.execute({
      link: { institutionId: "inst-1", sectorId: "UTI", deviceSignalId: "device-1" },
    });

    expect(port.chatDraftCalls).toEqual([{ institutionId: "inst-1", sectorId: "UTI", deviceSignalId: "device-1" }]);
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
        throw new Error("network down");
      }
    }
    const useCase = new RecordUnsentChatDraftUseCase(new ThrowingPort());

    await expect(
      useCase.execute({ link: { institutionId: "inst-1", sectorId: "UTI", deviceSignalId: "device-1" } }),
    ).rejects.toThrow("network down");
  });
});
