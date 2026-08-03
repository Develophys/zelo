import { describe, expect, it, vi } from "vitest";
import { GetManagerSignalsUseCase } from "./get-manager-signals.usecase";
import type { ManagerSignalsPort, ManagerSignalsResponse } from "@/ports/manager-signals.port";
import { UnauthorizedManagerError } from "@/ports/manager-signals.port";

const SAMPLE_RESPONSE: ManagerSignalsResponse = {
  overallConcerningRate: 0.41,
  checkInsLast4Weeks: 111,
  weeklyTrend: [{ weekStart: "2026-06-01T00:00:00.000Z", concerningRate: 0.3 }],
  segments: [{ label: "UTI", value: 44, n: 9 }],
  followUpResponseRate: 0.7,
};

class FakeManagerSignalsPort implements ManagerSignalsPort {
  constructor(private readonly result: ManagerSignalsResponse | Error) {}
  async fetchSignals(): Promise<ManagerSignalsResponse> {
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

describe("GetManagerSignalsUseCase", () => {
  it("returns the signals response on success", async () => {
    const useCase = new GetManagerSignalsUseCase(new FakeManagerSignalsPort(SAMPLE_RESPONSE));

    const result = await useCase.execute("valid-token");

    expect(result).toEqual(SAMPLE_RESPONSE);
  });

  it("propagates UnauthorizedManagerError on a rejected token", async () => {
    const useCase = new GetManagerSignalsUseCase(new FakeManagerSignalsPort(new UnauthorizedManagerError()));

    await expect(useCase.execute("expired-token")).rejects.toBeInstanceOf(UnauthorizedManagerError);
  });

  it("forwards sectorIds to the port", async () => {
    const port = new FakeManagerSignalsPort(SAMPLE_RESPONSE);
    const spy = vi.spyOn(port, "fetchSignals");
    const useCase = new GetManagerSignalsUseCase(port);

    await useCase.execute("valid-token", ["sector-1"]);

    expect(spy).toHaveBeenCalledWith("valid-token", ["sector-1"]);
  });
});
