import type {
  ManagerNotificationsPage,
  ManagerNotificationsPort,
} from "@/ports/manager-notifications.port";
import { ManagerNotificationsPageSchema } from "@/ports/manager-notifications.port";
import { UnauthorizedManagerError } from "@/ports/manager-signals.port";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000";

async function guard(response: Response, what: string): Promise<void> {
  if (response.status === 401) throw new UnauthorizedManagerError();
  if (!response.ok) throw new Error(`${what} failed with status ${response.status}`);
}

export class HttpManagerNotificationsAdapter implements ManagerNotificationsPort {
  async fetchPage(
    token: string,
    query: { cursor?: string | null; limit?: number },
  ): Promise<ManagerNotificationsPage> {
    const params = new URLSearchParams();
    if (query.cursor) params.set("cursor", query.cursor);
    if (query.limit !== undefined) params.set("limit", String(query.limit));
    const suffix = params.size > 0 ? `?${params.toString()}` : "";

    const response = await fetch(`${API_BASE_URL}/manager/notifications${suffix}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    await guard(response, "manager notifications fetch");
    return ManagerNotificationsPageSchema.parse(await response.json());
  }

  async fetchUnreadCount(token: string): Promise<number> {
    const response = await fetch(`${API_BASE_URL}/manager/notifications/unread-count`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    await guard(response, "manager unread count fetch");
    const body = (await response.json()) as { count: number };
    return body.count;
  }

  async markRead(token: string, id: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/manager/notifications/${id}/read`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}` },
    });
    await guard(response, "mark notification read");
  }

  async markAllRead(token: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/manager/notifications/read-all`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
    });
    await guard(response, "mark all notifications read");
  }
}
