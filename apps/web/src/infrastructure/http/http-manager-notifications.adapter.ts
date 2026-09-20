import { z } from "zod";
import type {
  ManagerNotificationsPage,
  ManagerNotificationsPort,
} from "@/ports/manager-notifications.port";
import { ManagerNotificationsPageSchema } from "@/ports/manager-notifications.port";
import { UnauthorizedManagerError } from "@/ports/manager-signals.port";
import { apiFetch } from "./api-fetch";

const UnreadCountSchema = z.object({ count: z.number() });


async function guard(response: Response, what: string): Promise<void> {
  if (response.status === 401) throw new UnauthorizedManagerError();
  if (!response.ok) throw new Error(`${what} failed with status ${response.status}`);
}

export class HttpManagerNotificationsAdapter implements ManagerNotificationsPort {
  async fetchPage(
    query: { cursor?: string | null; limit?: number },
  ): Promise<ManagerNotificationsPage> {
    const params = new URLSearchParams();
    if (query.cursor) params.set("cursor", query.cursor);
    if (query.limit !== undefined) params.set("limit", String(query.limit));
    const suffix = params.size > 0 ? `?${params.toString()}` : "";

    const response = await apiFetch(`/manager/notifications${suffix}`);
    await guard(response, "manager notifications fetch");
    return ManagerNotificationsPageSchema.parse(await response.json());
  }

  async fetchUnreadCount(): Promise<number> {
    const response = await apiFetch("/manager/notifications/unread-count");
    await guard(response, "manager unread count fetch");
    return UnreadCountSchema.parse(await response.json()).count;
  }

  async markRead(id: string): Promise<void> {
    const response = await apiFetch(`/manager/notifications/${id}/read`, { method: "PATCH" });
    await guard(response, "mark notification read");
  }

  async markAllRead(): Promise<void> {
    const response = await apiFetch("/manager/notifications/read-all", { method: "POST" });
    await guard(response, "mark all notifications read");
  }
}
