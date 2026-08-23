import type { NotificationType } from "./notification.port.ts";

export interface CreateNotificationParams {
  institutionId: string;
  managerId: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  sectorId: string | null;
  dedupKey: string;
}

export interface NotificationRow {
  id: string;
  type: NotificationType;
  payload: Record<string, unknown>;
  sectorId: string | null;
  sectorName: string | null;
  readAt: Date | null;
  createdAt: Date;
}

export interface NotificationPage {
  items: NotificationRow[];
  nextCursor: string | null;
  total: number | null;
}

export interface NotificationRepository {
  /** Idempotent: rows colliding on (managerId, dedupKey) are skipped. */
  createMany(rows: CreateNotificationParams[]): Promise<void>;
  findPage(managerId: string, query: { cursor: string | null; limit: number }): Promise<NotificationPage>;
  countUnread(managerId: string): Promise<number>;
  /** False when the row does not exist or belongs to another manager. */
  markRead(managerId: string, id: string): Promise<boolean>;
  markAllRead(managerId: string): Promise<void>;
  deleteReadOlderThan(cutoff: Date): Promise<number>;
}

export const NOTIFICATION_REPOSITORY = Symbol("NOTIFICATION_REPOSITORY");
