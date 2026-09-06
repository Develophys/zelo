import { Inject, Injectable } from "@nestjs/common";
import { startOfIsoWeek } from "@/shared/date/start-of-iso-week.js";
import { SIGNAL_REPOSITORY, type SignalRepository } from "@/modules/manager/application/ports/signal-repository.port.js";
import { NOTIFICATION_PUBLISHER, type NotificationPublisher } from "../ports/notification.port.ts";
import { RISK_DELTA_THRESHOLD, RISK_MIN_CHECK_INS, RISK_RATE_THRESHOLD } from "../thresholds.ts";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class SweepSectorRiskUseCase {
  constructor(
    @Inject(SIGNAL_REPOSITORY) private readonly signalRepository: SignalRepository,
    @Inject(NOTIFICATION_PUBLISHER) private readonly notifications: NotificationPublisher,
  ) {}

  // Weekly, not per check-in. The rate moves in both directions as check-ins
  // arrive: a sector at 4/10 on Wednesday reads 40% and would fire, but if the
  // week closes at 4/25 it was 16% and the alarm was false. A manager cannot
  // un-see an alarm, so a false one costs more than a late one.
  async execute(now: Date = new Date()): Promise<number> {
    const closedWeek = new Date(startOfIsoWeek(now).getTime() - WEEK_MS);
    const priorWeek = new Date(closedWeek.getTime() - WEEK_MS);

    const rows = await this.signalRepository.findAllForWeek([closedWeek, priorWeek]);
    const closed = rows.filter((r) => r.weekStart.getTime() === closedWeek.getTime());
    const prior = new Map(
      rows
        .filter((r) => r.weekStart.getTime() === priorWeek.getTime())
        .map((r) => [r.sectorId, r]),
    );

    let published = 0;

    for (const current of closed) {
      if (current.checkIns < RISK_MIN_CHECK_INS) continue;

      const rate = current.concerning / current.checkIns;
      const previous = prior.get(current.sectorId);
      const previousRate =
        previous && previous.checkIns >= RISK_MIN_CHECK_INS
          ? previous.concerning / previous.checkIns
          : null;

      // Level wins when both fire: "this sector is above the line" is the more
      // actionable statement, and two notifications for one week would be noise.
      const trigger =
        rate >= RISK_RATE_THRESHOLD
          ? "level"
          : previousRate !== null && rate - previousRate >= RISK_DELTA_THRESHOLD
            ? "delta"
            : null;

      if (!trigger) continue;

      await this.notifications.publish({
        institutionId: current.institutionId,
        type: "SECTOR_RISK_THRESHOLD",
        sectorId: current.sectorId,
        payload: {
          trigger,
          sectorName: current.sectorName,
          weekStart: current.weekStart.toISOString(),
          rate,
          checkIns: current.checkIns,
          ...(trigger === "delta" ? { previousRate } : {}),
        },
        dedupKey: `sector-risk:${current.sectorId}:${current.weekStart.toISOString()}`,
      });
      published += 1;
    }

    return published;
  }
}
