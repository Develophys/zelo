// A TS union rather than the Prisma enum: files under application/ must not
// import from generated/prisma (lint:boundaries enforces this). The Prisma
// enum in schema.prisma mirrors this list — they are kept in step by hand,
// the same way ManagerRole already is.
export type NotificationType =
  | "INVITE_ACCEPTED"
  | "INVITE_EXPIRED"
  | "INVITE_EMAIL_FAILED"
  | "ACCOUNT_DEACTIVATED"
  | "ACCOUNT_REACTIVATED"
  | "SECTOR_BECAME_VISIBLE"
  | "SECTOR_RISK_THRESHOLD";

export interface NotificationEvent {
  institutionId: string;
  type: NotificationType;
  /** Structured facts only. The PT-BR sentence is assembled in the frontend. */
  payload: Record<string, unknown>;
  sectorId?: string;
  /** Identifies the event, not the row. Uniqueness is per recipient. */
  dedupKey: string;
}

export interface NotificationPublisher {
  publish(event: NotificationEvent): Promise<void>;
}

export const NOTIFICATION_PUBLISHER = Symbol("NOTIFICATION_PUBLISHER");
