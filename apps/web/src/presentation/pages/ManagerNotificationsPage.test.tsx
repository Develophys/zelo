import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ManagerNotificationsPage } from "./ManagerNotificationsPage";
import * as container from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";
import { UnauthorizedManagerError } from "@/ports/manager-signals.port";

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

function renderPageWithRoutes() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/manager/notifications"]}>
        <Routes>
          <Route path="/manager/notifications" element={<ManagerNotificationsPage />} />
          <Route path="/manager/login" element={<div>Login screen</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  sessionStorage.clear();
  useManagerSessionStore
    .getState()
    .setSession("token", new Date(Date.now() + 60_000).toISOString(), "HOSPITAL_ADMIN");
  vi.restoreAllMocks();
});

describe("ManagerNotificationsPage", () => {
  it("renders the eyebrow, title and orientation paragraph every panel page shares", async () => {
    vi.spyOn(container.listManagerNotificationsUseCase, "execute").mockResolvedValue({
      items: [],
      nextCursor: null,
      total: 0,
    });
    vi.spyOn(container.listManagerNotificationsUseCase, "unreadCount").mockResolvedValue(0);

    renderPage();

    expect(await screen.findByRole("heading", { name: "Notificações" })).toBeInTheDocument();
    expect(
      screen.getByText(/Alertas do sistema sobre sinais agregados, convites e integrações/),
    ).toBeInTheDocument();
  });

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

  it("carries read/unread state in the row's accessible name, not only its visible pill", async () => {
    vi.spyOn(container.listManagerNotificationsUseCase, "execute").mockResolvedValue({
      items: [UNREAD, READ],
      nextCursor: null,
      total: 2,
    });
    vi.spyOn(container.listManagerNotificationsUseCase, "unreadCount").mockResolvedValue(1);

    renderPage();

    const unreadRow = await screen.findByRole("button", { name: /Paulo/ });
    const readRow = screen.getByRole("button", { name: /Marta/ });

    expect(unreadRow).toHaveAccessibleName(/Não lida/);
    expect(readRow).toHaveAccessibleName(/Lida/);
    expect(readRow).not.toHaveAccessibleName(/Não lida/);
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

  it("moves Marcar todas como lidas and Atualizar into the ruled-off action bar above the notification list, not the header's title row", async () => {
    vi.spyOn(container.listManagerNotificationsUseCase, "execute").mockResolvedValue({
      items: [UNREAD],
      nextCursor: null,
      total: 1,
    });
    vi.spyOn(container.listManagerNotificationsUseCase, "unreadCount").mockResolvedValue(1);

    renderPage();

    const bar = await screen.findByTestId("manager-action-bar");
    expect(
      await within(bar).findByRole("button", { name: "Marcar todas como lidas" }),
    ).toBeInTheDocument();
    expect(within(bar).getByRole("button", { name: "Atualizar" })).toBeInTheDocument();
    expect(bar.querySelector("hr")).not.toBeNull();

    const heading = screen.getByRole("heading", { level: 1, name: "Notificações" });
    expect(heading.parentElement).not.toContainElement(
      within(bar).getByRole("button", { name: "Atualizar" }),
    );
  });

  it("clears the session and redirects to login on a 401", async () => {
    vi.spyOn(container.listManagerNotificationsUseCase, "execute").mockRejectedValue(
      new UnauthorizedManagerError(),
    );
    vi.spyOn(container.listManagerNotificationsUseCase, "unreadCount").mockResolvedValue(0);

    renderPageWithRoutes();

    await waitFor(() => {
      expect(screen.getByText("Login screen")).toBeInTheDocument();
    });
    expect(useManagerSessionStore.getState().token).toBeNull();
  });
});
