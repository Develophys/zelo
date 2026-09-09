import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { startOfIsoWeek } from "@/shared/date/start-of-iso-week.js";
import {
  SIGNAL_CHECKIN_REPOSITORY,
  type SignalCheckinRepository,
} from "../ports/signal-checkin-repository.port.ts";

export interface RecordUnsentChatDraftInput {
  institutionId: string;
  sectorId: string;
  deviceSignalId: string;
}

@Injectable()
export class RecordUnsentChatDraftUseCase {
  constructor(@Inject(SIGNAL_CHECKIN_REPOSITORY) private readonly repository: SignalCheckinRepository) {}

  async execute(input: RecordUnsentChatDraftInput, now: Date = new Date()): Promise<void> {
    const weekStart = startOfIsoWeek(now);
    const dedupKey = createHash("sha256")
      .update(`chat-draft:${input.deviceSignalId}:${input.institutionId}:${input.sectorId}:${weekStart.toISOString()}`)
      .digest("hex");

    await this.repository.recordIncrement({
      institutionId: input.institutionId,
      sectorId: input.sectorId,
      weekStart,
      dedupKey,
      increments: { unsentChatDrafts: 1 },
    });
  }
}
