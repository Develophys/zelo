import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { startOfIsoWeek } from "../../../../shared/date/start-of-iso-week.ts";
import {
  SIGNAL_CHECKIN_REPOSITORY,
  type SignalCheckinRepository,
} from "../ports/signal-checkin-repository.port.ts";

export interface RecordSignalCheckinInput {
  institutionId: string;
  department: string;
  concerning: boolean;
  deviceSignalId: string;
}

@Injectable()
export class RecordSignalCheckinUseCase {
  constructor(@Inject(SIGNAL_CHECKIN_REPOSITORY) private readonly repository: SignalCheckinRepository) {}

  async execute(input: RecordSignalCheckinInput, now: Date = new Date()): Promise<void> {
    const weekStart = startOfIsoWeek(now);
    const dedupKey = createHash("sha256")
      .update(`${input.deviceSignalId}:${input.institutionId}:${input.department}:${weekStart.toISOString()}`)
      .digest("hex");

    await this.repository.recordCheckin({
      institutionId: input.institutionId,
      department: input.department,
      weekStart,
      concerning: input.concerning,
      dedupKey,
    });
  }
}
