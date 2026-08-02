import { describe, expect, it } from "vitest";
import { RecordSignalCheckinUseCase } from "./record-signal-checkin.usecase";
import type { SignalCheckinParams, SignalCheckinPort } from "@/ports/signal-checkin.port";

class FakeSignalCheckinPort implements SignalCheckinPort {
  public calls: SignalCheckinParams[] = [];
  async checkin(params: SignalCheckinParams): Promise<void> {
    this.calls.push(params);
  }
}

describe("RecordSignalCheckinUseCase", () => {
  it("does nothing when there is no institution link", async () => {
    const port = new FakeSignalCheckinPort();
    const useCase = new RecordSignalCheckinUseCase(port);

    await useCase.execute({ link: null, concerning: true });

    expect(port.calls).toHaveLength(0);
  });

  it("calls the port with the link's fields plus concerning, when a link exists", async () => {
    const port = new FakeSignalCheckinPort();
    const useCase = new RecordSignalCheckinUseCase(port);

    await useCase.execute({
      link: { institutionId: "inst-1", department: "UTI", deviceSignalId: "device-1" },
      concerning: true,
    });

    expect(port.calls).toEqual([
      { institutionId: "inst-1", department: "UTI", deviceSignalId: "device-1", concerning: true },
    ]);
  });

  it("propagates a port failure (the caller decides whether to swallow it)", async () => {
    class ThrowingPort implements SignalCheckinPort {
      async checkin(): Promise<void> {
        throw new Error("network down");
      }
    }
    const useCase = new RecordSignalCheckinUseCase(new ThrowingPort());

    await expect(
      useCase.execute({ link: { institutionId: "inst-1", department: "UTI", deviceSignalId: "device-1" }, concerning: false }),
    ).rejects.toThrow("network down");
  });
});
