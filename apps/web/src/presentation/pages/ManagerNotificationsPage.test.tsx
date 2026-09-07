import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ManagerNotificationsPage } from "./ManagerNotificationsPage";
import * as container from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";
import { useToastStore } from "@/stores/toast.store";

const UNREAD = {
  id: "n-1",
  type: "INVITE_ACCEPTED" as const,
  payload: { kind: "manager", name: "Paulo" },
  sectorName: null,
  readAt: null,
  createdAt: "2026-08-20T10:00:00.000Z",
};

const READ = {
  id: "n-2",
  type: "INVITE_ACCEPTED" as const,
  payload: { kind: "manager", name: "Marta" },
  sectorName: null,
  readAt: "2026-08-21T10:00:00.000Z",
  createdAt: "2026-08-20T09:00:00.000Z",
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <ManagerNotificationsPage />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  sessionStorage.clear();
  useManagerSessionStore
    .getState()
    .setSession("token", new Date(Date.now() + 60_000).toISOString(), "HOSPITAL_ADMIN");
  useToastStore.getState().clear();
  vi.restoreAllMocks();
});

describe("ManagerNotificationsPage", () => {
  it("shows the empty state when nothing has happened yet", async () => {
    vi.spyOn(container.listManagerNotificationsUseCase, "execute").mockResolvedValue({
      items: [],
      nextCursor: null,
      total: 0,
    });
    vi.spyOn(container.listManagerNotificationsUseCase, "unreadCount").mockResolvedValue(0);

    renderPage();

    expect(await screen.findByText("Nenhuma notificação por aqui.")).toBeInTheDocument();
  });

  it("renders an unread row with its PT-BR copy and the warning pill", async () => {
    vi.spyOn(container.listManagerNotificationsUseCase, "execute").mockResolvedValue({
      items: [UNREAD],
      nextCursor: null,
      total: 1,
    });
    vi.spyOn(container.listManagerNotificationsUseCase, "unreadCount").mockResolvedValue(1);

    renderPage();

    expect(await screen.findByText("Convite aceito")).toBeInTheDocument();
    expect(screen.getByText("Paulo concluiu o cadastro e já tem acesso.")).toBeInTheDocument();
    expect(screen.getByText("Não lida")).toBeInTheDocument();
  });

  it("does not tint good news the same amber as a failure, even though both are unread", async () => {
    const goodNews = { ...UNREAD, id: "n-good", type: "INVITE_ACCEPTED" as const };
    const badNews = {
      id: "n-bad",
      type: "INVITE_EMAIL_FAILED" as const,
      payload: { email: "paulo@zelo-demo.local" },
      sectorName: null,
      readAt: null,
      createdAt: "2026-08-20T10:00:00.000Z",
    };
    vi.spyOn(container.listManagerNotificationsUseCase, "execute").mockResolvedValue({
      items: [goodNews, badNews],
      nextCursor: null,
      total: 2,
    });
    vi.spyOn(container.listManagerNotificationsUseCase, "unreadCount").mockResolvedValue(2);

    renderPage();

    const goodRow = await screen.findByRole("button", { name: /Convite aceito/ });
    const badRow = screen.getByRole("button", { name: /Falha no envio/ });
    expect(goodRow.className).not.toContain("border-warn");
    expect(badRow.className).toContain("border-warn");
  });

  it("lets a manager resend a failed invite straight from the notification, instead of hunting for the row in the admin table", async () => {
    const failedInvite = {
      id: "n-bad",
      type: "INVITE_EMAIL_FAILED" as const,
      payload: { kind: "peer-partner", id: "peer-9", name: "Dr. Paulo", email: "paulo@zelo-demo.local" },
      sectorName: null,
      readAt: null,
      createdAt: "2026-08-20T10:00:00.000Z",
    };
    vi.spyOn(container.listManagerNotificationsUseCase, "execute").mockResolvedValue({
      items: [failedInvite],
      nextCursor: null,
      total: 1,
    });
    vi.spyOn(container.listManagerNotificationsUseCase, "unreadCount").mockResolvedValue(1);
    const resendSpy = vi
      .spyOn(container.sendPeerPartnerSetPasswordEmailUseCase, "execute")
      .mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderPage();

    const resend = await screen.findByRole("button", { name: "Reenviar convite" });
    await user.click(resend);

    await waitFor(() => expect(resendSpy).toHaveBeenCalledWith("token", "peer-9"));
    await waitFor(() =>
      expect(useToastStore.getState().toasts).toEqual([
        expect.objectContaining({ tone: "success", message: "Convite reenviado para paulo@zelo-demo.local." }),
      ]),
    );
  });

  it("also offers a resend for an expired invite, not only an email delivery failure", async () => {
    const expiredInvite = {
      id: "n-expired",
      type: "INVITE_EXPIRED" as const,
      payload: { kind: "manager", id: "manager-9", name: "Roberta Nunes" },
      sectorName: null,
      readAt: null,
      createdAt: "2026-08-20T10:00:00.000Z",
    };
    vi.spyOn(container.listManagerNotificationsUseCase, "execute").mockResolvedValue({
      items: [expiredInvite],
      nextCursor: null,
      total: 1,
    });
    vi.spyOn(container.listManagerNotificationsUseCase, "unreadCount").mockResolvedValue(1);
    const resendSpy = vi
      .spyOn(container.sendManagerSetPasswordEmailUseCase, "execute")
      .mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderPage();

    const resend = await screen.findByRole("button", { name: "Reenviar convite" });
    await user.click(resend);

    await waitFor(() => expect(resendSpy).toHaveBeenCalledWith("token", "manager-9"));
  });

  it("offers no resend action for a notification that predates the id being tracked", async () => {
    const legacyFailedInvite = {
      id: "n-legacy",
      type: "INVITE_EMAIL_FAILED" as const,
      payload: { kind: "peer-partner", name: "Dr. Paulo", email: "paulo@zelo-demo.local" },
      sectorName: null,
      readAt: null,
      createdAt: "2026-08-20T10:00:00.000Z",
    };
    vi.spyOn(container.listManagerNotificationsUseCase, "execute").mockResolvedValue({
      items: [legacyFailedInvite],
      nextCursor: null,
      total: 1,
    });
    vi.spyOn(container.listManagerNotificationsUseCase, "unreadCount").mockResolvedValue(1);

    renderPage();

    await screen.findByText("Falha no envio do convite");
    expect(screen.queryByRole("button", { name: "Reenviar convite" })).not.toBeInTheDocument();
  });

  it("carries read/unread state in the row's accessible name, not only its visible pill", async () => {
    vi.spyOn(container.listManagerNotificationsUseCase, "execute").mockResolvedValue({
      items: [UNREAD, READ],
      nextCursor: null,
      total: 2,
    });
    vi.spyOn(container.listManagerNotificationsUseCase, "unreadCount").mockResolvedValue(1);

    renderPage();

    const unreadRow = await screen.findByRole("button", { name: /Paulo/ });
    expect(unreadRow).toHaveAccessibleName(/Não lida/);

    // A read row is no longer a button — it does nothing — so the guarantee is
    // that its state still reaches assistive tech as text rather than only as a
    // colour. The pill is inside the row and read in document order.
    const readRow = screen.getByText(/Marta/).closest("li")!;
    expect(readRow).toHaveTextContent(/(?<!Não )lida/i);
    expect(readRow).not.toHaveTextContent(/Não lida/);
    expect(within(readRow).queryByRole("button")).toBeNull();
  });

  it("marks a row read by clicking anywhere on it, not only a control", async () => {
    vi.spyOn(container.listManagerNotificationsUseCase, "execute").mockResolvedValue({
      items: [UNREAD],
      nextCursor: null,
      total: 1,
    });
    vi.spyOn(container.listManagerNotificationsUseCase, "unreadCount").mockResolvedValue(1);
    const markRead = vi
      .spyOn(container.markManagerNotificationReadUseCase, "execute")
      .mockResolvedValue(undefined);

    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: /Convite aceito/ }));

    await waitFor(() => expect(markRead).toHaveBeenCalledWith("token", "n-1"));
  });

  it("refetches on Atualizar, which is the manual stand-in for push", async () => {
    const list = vi.spyOn(container.listManagerNotificationsUseCase, "execute").mockResolvedValue({
      items: [],
      nextCursor: null,
      total: 0,
    });
    vi.spyOn(container.listManagerNotificationsUseCase, "unreadCount").mockResolvedValue(0);

    const user = userEvent.setup();
    renderPage();
    await screen.findByText("Nenhuma notificação por aqui.");
    const before = list.mock.calls.length;

    await user.click(screen.getByRole("button", { name: "Atualizar" }));

    await waitFor(() => expect(list.mock.calls.length).toBeGreaterThan(before));
  });

  it("marks every notification read through Marcar todas como lidas", async () => {
    vi.spyOn(container.listManagerNotificationsUseCase, "execute").mockResolvedValue({
      items: [UNREAD, READ],
      nextCursor: null,
      total: 2,
    });
    vi.spyOn(container.listManagerNotificationsUseCase, "unreadCount").mockResolvedValue(1);
    const markAllRead = vi
      .spyOn(container.markManagerNotificationReadUseCase, "executeAll")
      .mockResolvedValue(undefined);

    const user = userEvent.setup();
    renderPage();

    const button = await screen.findByRole("button", { name: "Marcar todas como lidas" });
    expect(button).toBeEnabled();
    await user.click(button);

    await waitFor(() => expect(markAllRead).toHaveBeenCalledWith("token"));
  });

  it("does not offer Marcar todas como lidas when nothing is unread", async () => {
    vi.spyOn(container.listManagerNotificationsUseCase, "execute").mockResolvedValue({
      items: [READ],
      nextCursor: null,
      total: 1,
    });
    vi.spyOn(container.listManagerNotificationsUseCase, "unreadCount").mockResolvedValue(0);

    renderPage();

    await screen.findByText("Convite aceito");
    const button = screen.queryByRole("button", { name: "Marcar todas como lidas" });
    expect(button === null || (button as HTMLButtonElement).disabled).toBe(true);
  });

  it("keeps Marcar todas como lidas and Atualizar in a plain row above the notification list", async () => {
    vi.spyOn(container.listManagerNotificationsUseCase, "execute").mockResolvedValue({
      items: [UNREAD],
      nextCursor: null,
      total: 1,
    });
    vi.spyOn(container.listManagerNotificationsUseCase, "unreadCount").mockResolvedValue(1);

    renderPage();

    const bar = await screen.findByTestId("notifications-action-row");
    expect(
      await within(bar).findByRole("button", { name: "Marcar todas como lidas" }),
    ).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "Atualizar" })).toBeInTheDocument();
    expect(bar.querySelector("hr")).toBeNull();

    expect(bar.querySelector("ul, ol, table")).toBeNull();
  });

  it('leaves a read notification out of the tab order instead of offering a dead button', async () => {
    vi.spyOn(container.listManagerNotificationsUseCase, "execute").mockResolvedValue({
      items: [READ],
      nextCursor: null,
      total: 1,
    });
    vi.spyOn(container.listManagerNotificationsUseCase, "unreadCount").mockResolvedValue(0);

    renderPage();
    await screen.findByText("Lida");

    // The row's onClick already no-ops once read; leaving it a <button> still
    // makes a keyboard user tab through every archived notification.
    expect(document.querySelectorAll("li button")).toHaveLength(0);
  });

  it('keeps an unread notification actionable', async () => {
    vi.spyOn(container.listManagerNotificationsUseCase, "execute").mockResolvedValue({
      items: [UNREAD],
      nextCursor: null,
      total: 1,
    });
    vi.spyOn(container.listManagerNotificationsUseCase, "unreadCount").mockResolvedValue(1);

    renderPage();
    await screen.findByText("Não lida");

    expect(document.querySelectorAll("li button")).toHaveLength(1);
  });
  it("shows placeholder rows while loading instead of an empty screen", () => {
    vi.spyOn(container.listManagerNotificationsUseCase, "execute").mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(screen.getByTestId("notifications-loading")).toBeInTheDocument();
    expect(screen.queryByText("Nenhuma notificação por aqui.")).not.toBeInTheDocument();
  });

  it("collapses a repeated failure into one row with a count, instead of four identical-looking rows", async () => {
    const repeatedFailure = Array.from({ length: 4 }, (_, index) => ({
      id: `n-fail-${index}`,
      type: "INVITE_EMAIL_FAILED" as const,
      payload: { kind: "manager", id: `manager-${index}`, name: "Fernando Costa", email: "fernando@zelo-demo.local" },
      sectorName: null,
      readAt: index === 0 ? null : "2026-08-19T00:00:00.000Z",
      createdAt: `2026-08-2${index}T10:00:00.000Z`,
    }));
    vi.spyOn(container.listManagerNotificationsUseCase, "execute").mockResolvedValue({
      items: repeatedFailure,
      nextCursor: null,
      total: 4,
    });
    vi.spyOn(container.listManagerNotificationsUseCase, "unreadCount").mockResolvedValue(1);
    const markRead = vi
      .spyOn(container.markManagerNotificationReadUseCase, "execute")
      .mockResolvedValue(undefined);
    vi.spyOn(container.sendManagerSetPasswordEmailUseCase, "execute").mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderPage();

    const rows = await screen.findAllByText("Falha no envio do convite");
    expect(rows).toHaveLength(1);
    expect(screen.getByText(/×4/)).toBeInTheDocument();

    // A resendable group's row is a resend button, not a click-to-read row
    // (same as a single resendable notification today) — resending is the
    // action that settles the whole streak, so it marks every id in the
    // group read, not just the one it displays.
    await user.click(screen.getByRole("button", { name: "Reenviar convite" }));

    await waitFor(() => {
      for (const item of repeatedFailure) {
        expect(markRead).toHaveBeenCalledWith("token", item.id);
      }
    });
  });

  it("marks every notification in a non-resendable repeated group read from one click on the row", async () => {
    const repeated = Array.from({ length: 3 }, (_, index) => ({
      id: `n-legacy-${index}`,
      type: "INVITE_EMAIL_FAILED" as const,
      // No payload.id: a legacy row with no resend action, same as today's
      // "predates the id being tracked" case — the whole row is the button.
      payload: { kind: "manager", name: "Fernando Costa", email: "fernando@zelo-demo.local" },
      sectorName: null,
      readAt: index === 0 ? null : "2026-08-19T00:00:00.000Z",
      createdAt: `2026-08-2${index}T10:00:00.000Z`,
    }));
    vi.spyOn(container.listManagerNotificationsUseCase, "execute").mockResolvedValue({
      items: repeated,
      nextCursor: null,
      total: 3,
    });
    vi.spyOn(container.listManagerNotificationsUseCase, "unreadCount").mockResolvedValue(1);
    const markRead = vi
      .spyOn(container.markManagerNotificationReadUseCase, "execute")
      .mockResolvedValue(undefined);
    const user = userEvent.setup();

    renderPage();

    await user.click(await screen.findByRole("button", { name: /Falha no envio do convite/ }));

    await waitFor(() => {
      for (const item of repeated) {
        expect(markRead).toHaveBeenCalledWith("token", item.id);
      }
    });
  });

  it("does not collapse notifications of the same type for different recipients", async () => {
    vi.spyOn(container.listManagerNotificationsUseCase, "execute").mockResolvedValue({
      items: [
        {
          id: "n-a",
          type: "INVITE_EMAIL_FAILED" as const,
          payload: { email: "a@zelo-demo.local" },
          sectorName: null,
          readAt: null,
          createdAt: "2026-08-20T10:00:00.000Z",
        },
        {
          id: "n-b",
          type: "INVITE_EMAIL_FAILED" as const,
          payload: { email: "b@zelo-demo.local" },
          sectorName: null,
          readAt: null,
          createdAt: "2026-08-20T09:00:00.000Z",
        },
      ],
      nextCursor: null,
      total: 2,
    });
    vi.spyOn(container.listManagerNotificationsUseCase, "unreadCount").mockResolvedValue(2);

    renderPage();

    expect(await screen.findAllByText("Falha no envio do convite")).toHaveLength(2);
    expect(screen.queryByText(/×/)).not.toBeInTheDocument();
  });

  it("filters the list by notification type, only offering types actually present", async () => {
    vi.spyOn(container.listManagerNotificationsUseCase, "execute").mockResolvedValue({
      items: [UNREAD, { ...READ, id: "n-fail", type: "INVITE_EMAIL_FAILED" as const, payload: { email: "x@zelo-demo.local" } }],
      nextCursor: null,
      total: 2,
    });
    vi.spyOn(container.listManagerNotificationsUseCase, "unreadCount").mockResolvedValue(1);
    const user = userEvent.setup();

    renderPage();

    await screen.findAllByText("Convite aceito");
    expect(screen.getByText("Falha no envio do convite")).toBeInTheDocument();
    // Only types present in this manager's notifications get a filter pill —
    // no empty category clutters the row.
    expect(screen.queryByRole("radio", { name: "Conta desativada" })).not.toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Falha no envio" }));

    // The pill itself still reads "Convite aceito" even while that type is
    // filtered out — only the row for it should be gone.
    expect(within(screen.getByTestId("notifications-type-filter")).getByText("Convite aceito")).toBeInTheDocument();
    expect(screen.queryAllByText("Convite aceito")).toHaveLength(1);
    expect(screen.getByText("Falha no envio do convite")).toBeInTheDocument();

    await user.click(screen.getByRole("radio", { name: "Todos" }));

    expect(screen.getAllByText("Convite aceito")).toHaveLength(2);
    expect(screen.getByText("Falha no envio do convite")).toBeInTheDocument();
  });
});
