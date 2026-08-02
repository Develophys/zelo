import type { ManagerSignalsPort, ManagerSignalsResponse } from "@/ports/manager-signals.port";

export class GetManagerSignalsUseCase {
  constructor(private readonly signalsPort: ManagerSignalsPort) {}

  async execute(token: string, sectorIds?: string[]): Promise<ManagerSignalsResponse> {
    return this.signalsPort.fetchSignals(token, sectorIds);
  }
}
