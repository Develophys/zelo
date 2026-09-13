import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { startOfIsoWeek } from "@/shared/date/start-of-iso-week.js";
import {
  SIGNAL_CHECKIN_REPOSITORY,
  type SignalCheckinRepository,
} from "../ports/signal-checkin-repository.port.ts";

export type FollowUpEvent = "sent" | "answered";

export interface RecordFollowUpInput {
  institutionId: string;
  sectorId: string;
  deviceSignalId: string;
  event: FollowUpEvent;
}

@Injectable()
export class RecordFollowUpUseCase {
  constructor(@Inject(SIGNAL_CHECKIN_REPOSITORY) private readonly repository: SignalCheckinRepository) {}

  async execute(input: RecordFollowUpInput, now: Date = new Date()): Promise<void> {
    const weekStart = startOfIsoWeek(now);
    const dedupKey = createHash("sha256")
      .update(
        `follow-up:${input.event}:${input.deviceSignalId}:${input.institutionId}:${input.sectorId}:${weekStart.toISOString()}`,
      )
      .digest("hex");

    await this.repository.recordIncrement({
      institutionId: input.institutionId,
      sectorId: input.sectorId,
      weekStart,
      dedupKey,
      increments: input.event === "sent" ? { followUpSent: 1 } : { followUpAnswered: 1 },
    });
  }
}
