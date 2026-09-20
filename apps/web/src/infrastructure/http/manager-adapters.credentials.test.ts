import { afterEach, describe, expect, it, vi } from "vitest";
import { API_BASE_URL } from "./api-base-url";
import { HttpManagerAdminAdapter } from "./http-manager-admin.adapter";
import { HttpManagerAuthAdapter } from "./http-manager-auth.adapter";
import { HttpManagerInsightAdapter } from "./http-manager-insight.adapter";
import { HttpManagerInsightHistoryAdapter } from "./http-manager-insight-history.adapter";
import { HttpManagerNotificationsAdapter } from "./http-manager-notifications.adapter";
import { HttpManagerSectorsAdapter } from "./http-manager-sectors.adapter";
import { HttpManagerSignalsAdapter } from "./http-manager-signals.adapter";

interface AdapterCall {
  name: string;
  method: "GET" | "POST" | "PATCH" | "DELETE";
  path: string;
  jsonContentType: boolean;
  call: () => Promise<unknown>;
}

const CALLS: AdapterCall[] = [
  {
    name: "HttpManagerAuthAdapter.login",
    method: "POST",
    path: "/manager/login",
    jsonContentType: true,
    call: () => new HttpManagerAuthAdapter().login("ana@zelo-demo.local", "secret-password"),
  },
  {
    name: "HttpManagerAuthAdapter.me",
    method: "GET",
    path: "/manager/me",
    jsonContentType: false,
    call: () => new HttpManagerAuthAdapter().me(),
  },
  {
    name: "HttpManagerAuthAdapter.logout",
    method: "POST",
    path: "/manager/logout",
    jsonContentType: false,
    call: () => new HttpManagerAuthAdapter().logout(),
  },
  {
    name: "HttpManagerSignalsAdapter.fetchSignals",
    method: "GET",
    path: "/manager/signals",
    jsonContentType: false,
    call: () => new HttpManagerSignalsAdapter().fetchSignals(),
  },
  {
    name: "HttpManagerSectorsAdapter.listAccessible",
    method: "GET",
    path: "/manager/sectors",
    jsonContentType: false,
    call: () => new HttpManagerSectorsAdapter().listAccessible(),
  },
  {
    name: "HttpManagerInsightAdapter.generateInsight",
    method: "POST",
    path: "/manager/insights",
    jsonContentType: true,
    call: () => new HttpManagerInsightAdapter().generateInsight(),
  },
  {
    name: "HttpManagerInsightHistoryAdapter.fetchPage",
    method: "GET",
    path: "/manager/insights/history",
    jsonContentType: false,
    call: () => new HttpManagerInsightHistoryAdapter().fetchPage({}),
  },
  {
    name: "HttpManagerNotificationsAdapter.fetchPage",
    method: "GET",
    path: "/manager/notifications",
    jsonContentType: false,
    call: () => new HttpManagerNotificationsAdapter().fetchPage({}),
  },
  {
    name: "HttpManagerNotificationsAdapter.fetchUnreadCount",
    method: "GET",
    path: "/manager/notifications/unread-count",
    jsonContentType: false,
    call: () => new HttpManagerNotificationsAdapter().fetchUnreadCount(),
  },
  {
    name: "HttpManagerNotificationsAdapter.markRead",
    method: "PATCH",
    path: "/manager/notifications/n1/read",
    jsonContentType: false,
    call: () => new HttpManagerNotificationsAdapter().markRead("n1"),
  },
  {
    name: "HttpManagerNotificationsAdapter.markAllRead",
    method: "POST",
    path: "/manager/notifications/read-all",
    jsonContentType: true,
    call: () => new HttpManagerNotificationsAdapter().markAllRead(),
  },
  {
    name: "HttpManagerAdminAdapter.listSectors",
    method: "GET",
    path: "/manager/admin/sectors",
    jsonContentType: false,
    call: () => new HttpManagerAdminAdapter().listSectors(),
  },
  {
    name: "HttpManagerAdminAdapter.createSector",
    method: "POST",
    path: "/manager/admin/sectors",
    jsonContentType: true,
    call: () => new HttpManagerAdminAdapter().createSector({ name: "UTI" }),
  },
  {
    name: "HttpManagerAdminAdapter.updateSector",
    method: "PATCH",
    path: "/manager/admin/sectors/s1",
    jsonContentType: true,
    call: () => new HttpManagerAdminAdapter().updateSector("s1", { isActive: false }),
  },
  {
    name: "HttpManagerAdminAdapter.listManagers",
    method: "GET",
    path: "/manager/admin/managers",
    jsonContentType: false,
    call: () => new HttpManagerAdminAdapter().listManagers(),
  },
  {
    name: "HttpManagerAdminAdapter.createManager",
    method: "POST",
    path: "/manager/admin/managers",
    jsonContentType: true,
    call: () =>
      new HttpManagerAdminAdapter().createManager({
        name: "Paulo",
        email: "paulo@zelo-demo.local",
        role: "SECTOR_MANAGER",
      }),
  },
  {
    name: "HttpManagerAdminAdapter.updateManager",
    method: "PATCH",
    path: "/manager/admin/managers/m1",
    jsonContentType: true,
    call: () => new HttpManagerAdminAdapter().updateManager("m1", { isActive: false }),
  },
  {
    name: "HttpManagerAdminAdapter.sendManagerSetPasswordEmail",
    method: "POST",
    path: "/manager/admin/managers/m1/send-set-password-email",
    jsonContentType: true,
    call: () => new HttpManagerAdminAdapter().sendManagerSetPasswordEmail("m1"),
  },
  {
    name: "HttpManagerAdminAdapter.listPeerPartners",
    method: "GET",
    path: "/manager/admin/peer-partners",
    jsonContentType: false,
    call: () => new HttpManagerAdminAdapter().listPeerPartners(),
  },
  {
    name: "HttpManagerAdminAdapter.createPeerPartner",
    method: "POST",
    path: "/manager/admin/peer-partners",
    jsonContentType: true,
    call: () =>
      new HttpManagerAdminAdapter().createPeerPartner({
        name: "Bia",
        email: "bia@zelo-demo.local",
        specialty: "Psicologia",
      }),
  },
  {
    name: "HttpManagerAdminAdapter.updatePeerPartner",
    method: "PATCH",
    path: "/manager/admin/peer-partners/p1",
    jsonContentType: true,
    call: () => new HttpManagerAdminAdapter().updatePeerPartner("p1", { isActive: false }),
  },
  {
    name: "HttpManagerAdminAdapter.sendPeerPartnerSetPasswordEmail",
    method: "POST",
    path: "/manager/admin/peer-partners/p1/send-set-password-email",
    jsonContentType: true,
    call: () => new HttpManagerAdminAdapter().sendPeerPartnerSetPasswordEmail("p1"),
  },
  {
    name: "HttpManagerAdminAdapter.deleteManager",
    method: "DELETE",
    path: "/manager/admin/managers/m1",
    jsonContentType: false,
    call: () => new HttpManagerAdminAdapter().deleteManager("m1"),
  },
  {
    name: "HttpManagerAdminAdapter.deleteSector",
    method: "DELETE",
    path: "/manager/admin/sectors/s1",
    jsonContentType: false,
    call: () => new HttpManagerAdminAdapter().deleteSector("s1"),
  },
  {
    name: "HttpManagerAdminAdapter.deletePeerPartner",
    method: "DELETE",
    path: "/manager/admin/peer-partners/p1",
    jsonContentType: false,
    call: () => new HttpManagerAdminAdapter().deletePeerPartner("p1"),
  },
];

async function firstFetchCall(call: () => Promise<unknown>): Promise<{ url: string; init: RequestInit }> {
  const fetchSpy = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue({ ok: true, status: 200, json: async () => ({}) } as Response);

  await call().catch(() => undefined);

  expect(fetchSpy).toHaveBeenCalledTimes(1);
  const [url, init] = fetchSpy.mock.calls[0]!;
  return { url: String(url), init: init ?? {} };
}

describe("every manager adapter call", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each(CALLS)(
    "$name sends $method $path with the session cookie and no Authorization header",
    async ({ method, path, call }) => {
      const { url, init } = await firstFetchCall(call);

      expect(url.startsWith(API_BASE_URL)).toBe(true);
      expect(url).toBe(`${API_BASE_URL}${path}`);
      expect(init.method ?? "GET").toBe(method);
      expect(init).toMatchObject({ credentials: "include" });
      expect(JSON.stringify(init).toLowerCase()).not.toContain("authorization");
    },
  );

  it.each(CALLS)(
    "$name sends a JSON content type: $jsonContentType",
    async ({ jsonContentType, call }) => {
      const { init } = await firstFetchCall(call);

      expect(new Headers(init.headers).get("Content-Type")).toBe(jsonContentType ? "application/json" : null);
    },
  );
});
