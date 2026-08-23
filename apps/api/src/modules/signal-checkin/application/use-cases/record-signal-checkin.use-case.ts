import { createHash } from "node:crypto";
import { Inject, Injectable } from "@nestjs/common";
import { startOfIsoWeek } from "../../../../shared/date/start-of-iso-week.ts";
import {
  SIGNAL_CHECKIN_REPOSITORY,
  type SignalCheckinRepository,
} from "../ports/signal-checkin-repository.port.ts";
import { K_ANONYMITY_THRESHOLD } from "../../../manager/application/constants.ts";
import { NOTIFICATION_PUBLISHER, type NotificationPublisher } from "../../../notification/application/ports/notification.port.ts";

export interface RecordSignalCheckinInput {
  institutionId: string;
  sectorId: string;
  concerning: boolean;
  deviceSignalId: string;
}

@Injectable()
export class RecordSignalCheckinUseCase {
  constructor(
    @Inject(SIGNAL_CHECKIN_REPOSITORY) private readonly repository: SignalCheckinRepository,
    @Inject(NOTIFICATION_PUBLISHER) private readonly notifications: NotificationPublisher,
  ) {}

  async execute(input: RecordSignalCheckinInput, now: Date = new Date()): Promise<void> {
    const weekStart = startOfIsoWeek(now);
    const dedupKey = createHash("sha256")
      .update(`${input.deviceSignalId}:${input.institutionId}:${input.sectorId}:${weekStart.toISOString()}`)
      .digest("hex");

    const result = await this.repository.recordCheckin({
      institutionId: input.institutionId,
      sectorId: input.sectorId,
      weekStart,
      concerning: input.concerning,
      dedupKey,
    });

    // Within one week this counter only increases, so exactly one increment can
    // land on the threshold — an equality check is the whole crossing detector,
    // with no stored "already notified" flag to keep in sync.
    if (result?.checkIns === K_ANONYMITY_THRESHOLD) {
      await this.notifications.publish({
        institutionId: input.institutionId,
        type: "SECTOR_BECAME_VISIBLE",
        sectorId: input.sectorId,
        payload: { weekStart: weekStart.toISOString(), checkIns: result.checkIns },
        dedupKey: `sector-visible:${input.sectorId}:${weekStart.toISOString()}`,
      });
    }
  }
}
