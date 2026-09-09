import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { startOfIsoWeek } from "@/shared/date/start-of-iso-week.js";
import {
  SIGNAL_CHECKIN_REPOSITORY,
  type SignalCheckinRepository,
} from "../ports/signal-checkin-repository.port.ts";

export interface RecordAssessmentAbandonmentInput {
  institutionId: string;
  sectorId: string;
  deviceSignalId: string;
}

@Injectable()
export class RecordAssessmentAbandonmentUseCase {
  constructor(@Inject(SIGNAL_CHECKIN_REPOSITORY) private readonly repository: SignalCheckinRepository) {}

  async execute(input: RecordAssessmentAbandonmentInput, now: Date = new Date()): Promise<void> {
    const weekStart = startOfIsoWeek(now);
    const dedupKey = createHash("sha256")
      .update(`abandon:${input.deviceSignalId}:${input.institutionId}:${input.sectorId}:${weekStart.toISOString()}`)
      .digest("hex");

    await this.repository.recordAbandonment({
      institutionId: input.institutionId,
      sectorId: input.sectorId,
      weekStart,
      dedupKey,
    });
  }
}
