import { describe, expect, it } from "vitest";
import { RecordAssessmentAbandonmentUseCase } from "./record-assessment-abandonment.usecase";
import type { SignalAbandonmentParams, SignalCheckinPort } from "@/ports/signal-checkin.port";

class FakeSignalCheckinPort implements SignalCheckinPort {
  public abandonCalls: SignalAbandonmentParams[] = [];
  async checkin(): Promise<void> {
    throw new Error("not used in this test");
  }
  async abandon(params: SignalAbandonmentParams): Promise<void> {
    this.abandonCalls.push(params);
  }
}

describe("RecordAssessmentAbandonmentUseCase", () => {
  it("does nothing when there is no institution link", async () => {
    const port = new FakeSignalCheckinPort();
    const useCase = new RecordAssessmentAbandonmentUseCase(port);

    await useCase.execute({ link: null });

    expect(port.abandonCalls).toHaveLength(0);
  });

  it("calls the port with the link's fields, when a link exists", async () => {
    const port = new FakeSignalCheckinPort();
    const useCase = new RecordAssessmentAbandonmentUseCase(port);

    await useCase.execute({
      link: { institutionId: "inst-1", sectorId: "UTI", deviceSignalId: "device-1" },
    });

    expect(port.abandonCalls).toEqual([{ institutionId: "inst-1", sectorId: "UTI", deviceSignalId: "device-1" }]);
  });

  it("propagates a port failure (the caller decides whether to swallow it)", async () => {
    class ThrowingPort implements SignalCheckinPort {
      async checkin(): Promise<void> {
        throw new Error("not used in this test");
      }
      async abandon(): Promise<void> {
        throw new Error("network down");
      }
    }
    const useCase = new RecordAssessmentAbandonmentUseCase(new ThrowingPort());

    await expect(
      useCase.execute({ link: { institutionId: "inst-1", sectorId: "UTI", deviceSignalId: "device-1" } }),
    ).rejects.toThrow("network down");
  });
});
