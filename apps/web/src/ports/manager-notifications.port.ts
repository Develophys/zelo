import { z } from "zod";

export const MANAGER_NOTIFICATION_TYPES = [
  "INVITE_ACCEPTED",
  "INVITE_EXPIRED",
  "INVITE_EMAIL_FAILED",
  "ACCOUNT_DEACTIVATED",
  "ACCOUNT_REACTIVATED",
  "SECTOR_BECAME_VISIBLE",
  "SECTOR_RISK_THRESHOLD",
] as const;

export const ManagerNotificationSchema = z.object({
  id: z.string(),
  type: z.enum(MANAGER_NOTIFICATION_TYPES),
  payload: z.record(z.unknown()),
  sectorName: z.string().nullable(),
  readAt: z.string().nullable(),
  createdAt: z.string(),
});
export type ManagerNotification = z.infer<typeof ManagerNotificationSchema>;

export const ManagerNotificationsPageSchema = z.object({
  items: z.array(ManagerNotificationSchema),
  nextCursor: z.string().nullable(),
  total: z.number().nullable(),
});
export type ManagerNotificationsPage = z.infer<typeof ManagerNotificationsPageSchema>;

export interface ManagerNotificationsPort {
  fetchPage(token: string, query: { cursor?: string | null; limit?: number }): Promise<ManagerNotificationsPage>;
  fetchUnreadCount(token: string): Promise<number>;
  markRead(token: string, id: string): Promise<void>;
  markAllRead(token: string): Promise<void>;
}
