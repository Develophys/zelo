import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { SweepLapsedInvitesUseCase } from "../application/use-cases/sweep-lapsed-invites.use-case.ts";
import { SweepNotificationRetentionUseCase } from "../application/use-cases/sweep-notification-retention.use-case.ts";
import { SweepSectorRiskUseCase } from "../application/use-cases/sweep-sector-risk.use-case.ts";

// Cron expressions are UTC, matching startOfIsoWeek, which anchors every weekly
// boundary in this codebase to Monday 00:00 UTC.
//
// Fly runs one machine (min_machines_running = 1, auto_stop_machines = false),
// so no leader election is needed. If it ever runs two, the (managerId,
// dedupKey) unique constraint already makes a doubly-executed sweep produce one
// row — the same protection SignalDedupKey gives the check-in path.
@Injectable()
export class NotificationScheduler {
  private readonly logger = new Logger(NotificationScheduler.name);

  constructor(
    @Inject(SweepLapsedInvitesUseCase) private readonly sweepLapsedInvites: SweepLapsedInvitesUseCase,
    @Inject(SweepNotificationRetentionUseCase)
    private readonly sweepRetention: SweepNotificationRetentionUseCase,
    @Inject(SweepSectorRiskUseCase) private readonly sweepSectorRisk: SweepSectorRiskUseCase,
  ) {}

  @Cron("0 3 * * *")
  async daily(): Promise<void> {
    const published = await this.sweepLapsedInvites.execute();
    const purged = await this.sweepRetention.execute();
    this.logger.log(`daily sweep: ${published} expiries published, ${purged} read notifications purged`);
  }

  @Cron("0 3 * * 1")
  async weekly(): Promise<void> {
    const published = await this.sweepSectorRisk.execute();
    this.logger.log(`weekly risk sweep: ${published} sector alerts published`);
  }
}
