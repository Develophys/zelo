import { Inject, Injectable, Logger } from "@nestjs/common";
import { NOTIFICATION_REPOSITORY, type NotificationRepository } from "../ports/notification-repository.port.ts";
import type { NotificationEvent, NotificationPublisher } from "../ports/notification.port.ts";
import { ResolveNotificationRecipientsUseCase } from "./resolve-notification-recipients.use-case.ts";

@Injectable()
export class PublishNotificationUseCase implements NotificationPublisher {
  private readonly logger = new Logger(PublishNotificationUseCase.name);

  constructor(
    @Inject(ResolveNotificationRecipientsUseCase)
    private readonly resolveRecipients: ResolveNotificationRecipientsUseCase,
    @Inject(NOTIFICATION_REPOSITORY) private readonly repository: NotificationRepository,
  ) {}

  // The single point of contact for every producer. Today it resolves and
  // writes; a real-time channel, a critical-path email or a broker each land
  // inside this method, which is why no producer has to change for any of them.
  async publish(event: NotificationEvent): Promise<void> {
    try {
      const recipients = await this.resolveRecipients.execute(event);
      if (recipients.length === 0) return;

      await this.repository.createMany(
        recipients.map((managerId) => ({
          institutionId: event.institutionId,
          managerId,
          type: event.type,
          payload: event.payload,
          sectorId: event.sectorId ?? null,
          dedupKey: event.dedupKey,
        })),
      );
    } catch (error) {
      // Deliberately terminal. The fact that caused this event has already been
      // committed, and losing its notification is strictly better than undoing it.
      this.logger.error(`failed to publish ${event.type} (${event.dedupKey})`, error);
      console.error(error);
    }
  }
}
