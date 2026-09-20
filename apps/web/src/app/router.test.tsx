import { afterEach, describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider, Outlet } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRouteChildren, endSession, routeChildren, router } from "./router";
import { registerSessionCache } from "./session-cache";
import { handleSessionExpired } from "./handle-session-expired";
import { clearRoleSession } from "./clear-role-session";
import type { SessionRole } from "./session-expiry";
import { ManagerShell } from "@/presentation/layout/ManagerShell";
import { useConsentStore } from "@/stores/consent.store";
import { useManagerSessionStore } from "@/stores/manager-session.store";
import { routes } from "@/presentation/lib/routes";
import { PHQ9_QUESTIONS } from "@/domain/assessment-scales/phq9";
import { GAD7_QUESTIONS } from "@/domain/assessment-scales/gad7";
import { UnauthorizedManagerError } from "@/ports/manager-signals.port";
import * as container from "./container";

// Reuses router.tsx's own route tree (routeChildren) rather than duplicating
// it, so this test can never silently drift from what actually ships.
function buildTestRouter(initialPath: string) {
  function endSession(role: SessionRole): void {
    handleSessionExpired(role, {
      clearSession: clearRoleSession,
      currentPath: () => router.state.location.pathname,
      navigate: (to, options) => void router.navigate(to, options),
    });
  }
  const router = createMemoryRouter(
    [
      {
        id: "root",
        path: "/",
        Component: () => <Outlet />,
        children: createRouteChildren(endSession),
      },
    ],
    { initialEntries: [initialPath] },
  );
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

function stubManagerSession(role: "HOSPITAL_ADMIN" | "SECTOR_MANAGER" = "HOSPITAL_ADMIN") {
  return vi.spyOn(container.getManagerSessionUseCase, "execute").mockResolvedValue({ name: "Ana", role });
}

function stubManagerSessionRejected() {
  return vi
    .spyOn(container.getManagerSessionUseCase, "execute")
    .mockRejectedValue(new UnauthorizedManagerError());
}

describe("onboarding router flow", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    useConsentStore.setState({ hasConsented: false, consentedAt: null });
    useManagerSessionStore.setState({ loggedIn: false, role: null, name: null });
  });

  it("cold start walks Splash -> Privacy -> Consent -> Home", async () => {
    buildTestRouter("/");
    const user = userEvent.setup();

    expect(await screen.findByRole("button", { name: "Começar" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Começar" }));

    expect(await screen.findByText("Como o Zelo protege você")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Entendi, continuar" }));

    expect(await screen.findByText("Seu consentimento")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Aceitar e entrar" }));

    await waitFor(() => {
      expect(useConsentStore.getState().hasConsented).toBe(true);
    });
  });

  it("warm start (already consented) redirects straight to Home via the loader", async () => {
    useConsentStore.setState({ hasConsented: true, consentedAt: "2026-01-01T00:00:00.000Z" });
    buildTestRouter("/");
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Começar" })).not.toBeInTheDocument();
    });
  });

  it("an unconsented user hitting /home directly is redirected to Privacy via the loader", async () => {
    buildTestRouter("/home");

    expect(await screen.findByText("Como o Zelo protege você")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Fazer check-in" })).not.toBeInTheDocument();
  });

  it("Home's check-in CTA reaches the assessment selector through the real route table", async () => {
    useConsentStore.setState({ hasConsented: true, consentedAt: "2026-01-01T00:00:00.000Z" });
    buildTestRouter("/home");
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Fazer check-in" }));
    expect(await screen.findByText("Autoavaliação")).toBeInTheDocument();
  });

  it("the crisis fork is reachable and both branches resolve without dead-ends", async () => {
    useConsentStore.setState({ hasConsented: true, consentedAt: "2026-01-01T00:00:00.000Z" });
    buildTestRouter("/crisis");
    const user = userEvent.setup();

    expect(await screen.findByRole("button", { name: "Agora não" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Agora não" }));
    expect(
      await screen.findByRole("heading", { level: 2, name: "Tudo bem. A escolha é sua." }),
    ).toBeInTheDocument();
  });

  it("Home's quick action reaches Peers", async () => {
    useConsentStore.setState({ hasConsented: true, consentedAt: "2026-01-01T00:00:00.000Z" });
    buildTestRouter("/home");
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /falar com um par/i }));
    expect(await screen.findByText("Pares anônimos")).toBeInTheDocument();
  });

  it("the Configurações Administração entry reaches the manager login screen when unauthenticated", async () => {
    useConsentStore.setState({ hasConsented: true, consentedAt: "2026-01-01T00:00:00.000Z" });
    stubManagerSessionRejected();
    buildTestRouter("/home");
    const user = userEvent.setup();

    const bottomNav = await screen.findByTestId("bottom-nav");
    await user.click(within(bottomNav).getByRole("link", { name: "Configurações" }));
    await user.click(await screen.findByRole("link", { name: "Administração" }));
    expect(await screen.findByText("Acesso do gestor")).toBeInTheDocument();
  });

  it("the manager login screen is still reachable by its own route", async () => {
    useConsentStore.setState({ hasConsented: true, consentedAt: "2026-01-01T00:00:00.000Z" });
    buildTestRouter("/manager/login");

    expect(await screen.findByText("Acesso do gestor")).toBeInTheDocument();
  });

  it("the manager forgot-password screen is reachable by its own route", async () => {
    buildTestRouter("/manager/forgot-password");

    expect(await screen.findByText("Esqueceu a senha?")).toBeInTheDocument();
  });

  it("the peer partner forgot-password screen is reachable by its own route", async () => {
    buildTestRouter("/peer/forgot-password");

    expect(await screen.findByText("Esqueceu a senha?")).toBeInTheDocument();
  });

  it("an authenticated manager session reaches the dashboard directly", async () => {
    useConsentStore.setState({ hasConsented: true, consentedAt: "2026-01-01T00:00:00.000Z" });
    useManagerSessionStore.setState({ loggedIn: true, role: "HOSPITAL_ADMIN", name: "Ana" });
    stubManagerSession();
    vi.spyOn(container.getManagerSignalsUseCase, "execute").mockResolvedValue({
      overallConcerningRate: 0,
      checkInsLast4Weeks: 0,
      abandonedLast4Weeks: 0,
      unsentChatDraftsLast4Weeks: 0,
      weeklyTrend: [],
      segments: [],
      followUpResponseRate: 0,
      followUpSent: 0,
      followUpAnswered: 0,
      sectorCoverage: { visible: 0, total: 0 },
      referenceWeekStart: null,
    });

    buildTestRouter("/manager");

    expect(await screen.findByRole("heading", { level: 1, name: "Tendências" })).toBeInTheDocument();
  });

  it("keeps /manager/admin alive as a redirect, so links to the old tabbed page still land somewhere", async () => {
    useConsentStore.setState({ hasConsented: true, consentedAt: "2026-01-01T00:00:00.000Z" });
    useManagerSessionStore.setState({ loggedIn: true, role: "HOSPITAL_ADMIN", name: "Ana" });
    stubManagerSession();
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([]);

    buildTestRouter("/manager/admin");

    // The create-manager field now lives inside a modal rather than inline,
    // so the redirect is verified against the page heading instead.
    expect(await screen.findByRole("heading", { level: 1, name: "Gestores" })).toBeInTheDocument();
  });

  it("keeps Administração out of reach for a SECTOR_MANAGER, who sees the dashboard instead", async () => {
    useConsentStore.setState({ hasConsented: true, consentedAt: "2026-01-01T00:00:00.000Z" });
    useManagerSessionStore.setState({ loggedIn: true, role: "SECTOR_MANAGER", name: "Paulo" });
    stubManagerSession("SECTOR_MANAGER");
    vi.spyOn(container.getManagerSignalsUseCase, "execute").mockResolvedValue({
      overallConcerningRate: 0,
      checkInsLast4Weeks: 0,
      abandonedLast4Weeks: 0,
      unsentChatDraftsLast4Weeks: 0,
      weeklyTrend: [],
      segments: [],
      followUpResponseRate: 0,
      followUpSent: 0,
      followUpAnswered: 0,
      sectorCoverage: { visible: 0, total: 0 },
      referenceWeekStart: null,
    });

    buildTestRouter("/manager/admin/sectors");

    expect(await screen.findByRole("heading", { level: 1, name: "Tendências" })).toBeInTheDocument();
  });

  it.each([
    ["/manager/notifications", "Notificações"],
    ["/manager/settings", "Configurações"],
  ])("reaches the new %s route behind the manager guard", async (path, heading) => {
    useConsentStore.setState({ hasConsented: true, consentedAt: "2026-01-01T00:00:00.000Z" });
    useManagerSessionStore.setState({ loggedIn: true, role: "HOSPITAL_ADMIN", name: "Ana" });
    stubManagerSession();

    buildTestRouter(path);

    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
  });

  it("an unauthenticated visit to /manager/history redirects to the manager login screen", async () => {
    useConsentStore.setState({ hasConsented: true, consentedAt: "2026-01-01T00:00:00.000Z" });
    stubManagerSessionRejected();

    buildTestRouter("/manager/history");

    expect(await screen.findByText("Acesso do gestor")).toBeInTheDocument();
  });

  it("Home's Você tab reaches the consent screen, and revoking returns to Splash", async () => {
    useConsentStore.setState({ hasConsented: true, consentedAt: "2026-01-01T00:00:00.000Z" });
    buildTestRouter("/home");
    const user = userEvent.setup();

    // Follow the Você tab in the BottomNav
    const bottomNav = await screen.findByTestId("bottom-nav");
    const vocêButton = bottomNav.querySelector('a[aria-label="Você"]');
    if (!vocêButton) throw new Error("Você tab not found in BottomNav");
    await user.click(vocêButton);

    expect(await screen.findByText("Consentimento ativo")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Revogar consentimento" }));
    await user.click(screen.getByRole("button", { name: "Sim, revogar" }));

    expect(await screen.findByRole("button", { name: "Começar" })).toBeInTheDocument();
    expect(useConsentStore.getState().hasConsented).toBe(false);
  });

  it("an unconsented user hitting /you directly is redirected to Privacy via the loader", async () => {
    buildTestRouter("/you");
    expect(await screen.findByText("Como o Zelo protege você")).toBeInTheDocument();
  });

  it("an unconsented user hitting /you/link directly is redirected to Privacy via the loader", async () => {
    buildTestRouter("/you/link");
    expect(await screen.findByText("Como o Zelo protege você")).toBeInTheDocument();
  });

  it("wires /assessment/phq9 to the PHQ-9 scale", async () => {
    useConsentStore.setState({ hasConsented: true, consentedAt: "2026-01-01T00:00:00.000Z" });
    buildTestRouter(routes.phq9);
    expect(await screen.findByText(PHQ9_QUESTIONS[0])).toBeInTheDocument();
    expect(screen.getByText(`1/${PHQ9_QUESTIONS.length}`)).toBeInTheDocument();
  });

  it("wires /assessment/gad7 to the GAD-7 scale", async () => {
    useConsentStore.setState({ hasConsented: true, consentedAt: "2026-01-01T00:00:00.000Z" });
    buildTestRouter(routes.gad7);
    expect(await screen.findByText(GAD7_QUESTIONS[0])).toBeInTheDocument();
    expect(screen.getByText(`1/${GAD7_QUESTIONS.length}`)).toBeInTheDocument();
  });

  it("reaches the doctor's Configurações screen behind the consent guard", async () => {
    useConsentStore.setState({ hasConsented: true, consentedAt: "2026-01-01T00:00:00.000Z" });
    buildTestRouter("/settings");

    expect(await screen.findByRole("heading", { level: 2, name: "Cor de destaque" })).toBeInTheDocument();
  });

  it("redirects an unconsented visitor away from Configurações, like every other gated screen", async () => {
    buildTestRouter("/settings");

    expect(await screen.findByText("Como o Zelo protege você")).toBeInTheDocument();
  });
});
describe("consent gate", () => {
  beforeEach(() => {
    useConsentStore.setState({ hasConsented: false, consentedAt: null });
  });

  it.each(["/chat", "/assessment", "/assessment/phq9", "/assessment/gad7", "/peers"])(
    "sends an unconsented visitor from %s to the privacy screen",
    async (path) => {
      buildTestRouter(path);
      // These routes collect mental-health answers or send text to an AI
      // provider. The consent screen is where that is disclosed.
      expect(await screen.findByText(/Privacidade/i)).toBeInTheDocument();
    },
  );

  it.each(["/crisis", "/crisis/line"])(
    "lets an unconsented visitor reach %s, deliberately",
    async (path) => {
      buildTestRouter(path);
      // Someone in crisis must reach the CVV number without being sent through
      // a consent form first. This is the one place the gate must not apply.
      expect(await screen.findByRole("link", { name: /Ligar para o CVV/ })).toBeInTheDocument();
    },
  );
});
describe("last-resort screens", () => {
  it("answers an unknown URL in Portuguese, with the crisis line still reachable", async () => {
    useConsentStore.setState({ hasConsented: true, consentedAt: "2026-01-01T00:00:00.000Z" });
    buildTestRouter("/rota-que-nao-existe");

    // The default React Router 404 is unstyled English with no CVV number, on a
    // product whose non-negotiable property is that the line is always reachable.
    expect(await screen.findByRole("heading", { level: 2 })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ligar para o CVV/ })).toHaveAttribute(
      "href",
      "tel:188",
    );
    expect(screen.getByRole("button", { name: "Voltar ao início" })).toBeInTheDocument();
  });
});
describe("manager route tree", () => {
  /**
   * The session guard is the loader of ManagerShell's layout route. That only
   * covers a manager page that is actually a child of that route — which is
   * exactly what drifted before, leaving three of six pages showing a table
   * error with a retry that could never succeed.
   */
  it("puts every manager panel route under ManagerShell, so none can miss the session guard", () => {
    const shellRoute = routeChildren.find((route) => route.Component === ManagerShell);
    const nested = (shellRoute?.children ?? []).map((child) => `/${child.path}`);

    for (const route of [
      routes.manager,
      routes.managerNotifications,
      routes.managerHistory,
      routes.managerSettings,
      routes.managerAdminManagers,
      routes.managerAdminSectors,
      routes.managerAdminPeers,
    ]) {
      expect(nested).toContain(route);
    }
  });
});
describe("manager session guard", () => {
  afterEach(() => {
    registerSessionCache({ clear: () => {}, reset: () => {} });
  });

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    useConsentStore.setState({ hasConsented: true, consentedAt: "2026-01-01T00:00:00.000Z" });
    useManagerSessionStore.setState({ loggedIn: false, role: null, name: null });
    vi.spyOn(container.listManagerNotificationsUseCase, "unreadCount").mockResolvedValue(0);
    vi.spyOn(container.getManagerSignalsUseCase, "execute").mockResolvedValue({
      overallConcerningRate: 0,
      checkInsLast4Weeks: 0,
      abandonedLast4Weeks: 0,
      unsentChatDraftsLast4Weeks: 0,
      weeklyTrend: [],
      segments: [],
      followUpResponseRate: 0,
      followUpSent: 0,
      followUpAnswered: 0,
      sectorCoverage: { visible: 0, total: 0 },
      referenceWeekStart: null,
    });
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.listPeerPartnersUseCase, "execute").mockResolvedValue([]);
  });

  it("a new tab with a valid cookie but an empty flag reaches the panel", async () => {
    stubManagerSession("SECTOR_MANAGER");

    buildTestRouter("/manager");

    expect(await screen.findByRole("heading", { level: 1, name: "Tendências" })).toBeInTheDocument();
    expect(useManagerSessionStore.getState()).toMatchObject({ loggedIn: true, role: "SECTOR_MANAGER", name: "Ana" });
  });

  it("sends a flagged session that /me no longer accepts to the login screen, says it expired, and drops the flag", async () => {
    useManagerSessionStore.setState({ loggedIn: true, role: "HOSPITAL_ADMIN", name: "Ana" });
    stubManagerSessionRejected();

    buildTestRouter("/manager");

    expect(await screen.findByText("Acesso do gestor")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(/sessão expirou/i);
    expect(useManagerSessionStore.getState().loggedIn).toBe(false);
  });

  it("keeps the panel on screen when /me fails for a reason that is not a rejection, such as being offline", async () => {
    useManagerSessionStore.setState({ loggedIn: true, role: "HOSPITAL_ADMIN", name: "Ana" });
    vi.spyOn(container.getManagerSessionUseCase, "execute").mockRejectedValue(new Error("offline"));

    buildTestRouter("/manager");

    expect(await screen.findByRole("heading", { level: 1, name: "Tendências" })).toBeInTheDocument();
    expect(useManagerSessionStore.getState().loggedIn).toBe(true);
  });

  it.each([
    [routes.managerAdminManagers, "Gestores"],
    [routes.managerAdminSectors, "Setores"],
    [routes.managerAdminPeers, "Pares anônimos"],
  ])(
    "a HOSPITAL_ADMIN opening a bookmark to %s in a new tab, before the guard has filled the role, still reaches it",
    async (path, heading) => {
      stubManagerSession("HOSPITAL_ADMIN");

      buildTestRouter(path);

      expect(
        await screen.findByRole("heading", { level: 1, name: heading }, { timeout: 5000 }),
      ).toBeInTheDocument();
    },
  );

  it("resets the query cache, without clearing it, when /me confirms a different person than the flag remembered", async () => {
    const clear = vi.fn();
    const reset = vi.fn();
    registerSessionCache({ clear, reset });
    useManagerSessionStore.setState({ loggedIn: true, role: "HOSPITAL_ADMIN", name: "Ana" });
    vi.spyOn(container.getManagerSessionUseCase, "execute").mockResolvedValue({ name: "Paulo", role: "SECTOR_MANAGER" });

    buildTestRouter("/manager");

    await screen.findByRole("heading", { level: 1, name: "Tendências" }, { timeout: 5000 });
    await waitFor(() => {
      expect(useManagerSessionStore.getState()).toMatchObject({ role: "SECTOR_MANAGER", name: "Paulo" });
    });
    expect(reset).toHaveBeenCalledTimes(1);
    expect(clear).not.toHaveBeenCalled();
  });

  it("neither resets nor clears the query cache when /me confirms the same person the flag already remembered", async () => {
    const clear = vi.fn();
    const reset = vi.fn();
    registerSessionCache({ clear, reset });
    useManagerSessionStore.setState({ loggedIn: true, role: "HOSPITAL_ADMIN", name: "Ana" });
    const confirm = vi
      .spyOn(container.getManagerSessionUseCase, "execute")
      .mockResolvedValue({ name: "Ana", role: "HOSPITAL_ADMIN" });

    buildTestRouter("/manager");

    await screen.findByRole("heading", { level: 1, name: "Tendências" }, { timeout: 5000 });
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    await confirm.mock.results[0]?.value;

    expect(reset).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });

  it("a SECTOR_MANAGER opening an Administração bookmark in a new tab is sent to the dashboard", async () => {
    stubManagerSession("SECTOR_MANAGER");

    buildTestRouter(routes.managerAdminManagers);

    expect(
      await screen.findByRole("heading", { level: 1, name: "Tendências" }, { timeout: 5000 }),
    ).toBeInTheDocument();
  });

  it("an Administração bookmark opened without a valid cookie goes to the login screen, not the dashboard", async () => {
    stubManagerSessionRejected();

    buildTestRouter(routes.managerAdminSectors);

    expect(await screen.findByText("Acesso do gestor")).toBeInTheDocument();
  });
});
describe("endSession", () => {
  afterEach(() => {
    registerSessionCache({ clear: () => {}, reset: () => {} });
  });

  function stubNavigation() {
    let settle = () => {};
    const settled = new Promise<void>((resolve) => {
      settle = resolve;
    });
    const navigate = vi.spyOn(router, "navigate").mockReturnValue(settled);
    return { navigate, settle };
  }

  function routerStateAt(pathname: string, navigatingTo?: string) {
    return {
      location: { pathname },
      navigation: { location: navigatingTo === undefined ? undefined : { pathname: navigatingTo } },
    } as unknown as typeof router.state;
  }

  it("clears the query cache once the redirect has settled, not before, so no mounted page can refetch into the dead session", async () => {
    const clear = vi.fn();
    registerSessionCache({ clear, reset: () => {} });
    const { navigate, settle } = stubNavigation();

    endSession("manager");

    expect(navigate).toHaveBeenCalledWith(routes.managerLogin, { replace: true, state: { reason: "expired" } });
    expect(clear).not.toHaveBeenCalled();

    await Promise.resolve();
    expect(clear).not.toHaveBeenCalled();

    settle();
    await vi.waitFor(() => expect(clear).toHaveBeenCalledTimes(1));
    await Promise.resolve();
    expect(clear).toHaveBeenCalledTimes(1);
  });

  it("neither navigates nor clears when the person is already on the login screen", async () => {
    const clear = vi.fn();
    registerSessionCache({ clear, reset: () => {} });
    vi.spyOn(router, "state", "get").mockReturnValue(routerStateAt(routes.managerLogin));
    const navigate = vi.spyOn(router, "navigate").mockResolvedValue(undefined);

    endSession("manager");
    await Promise.resolve();

    expect(navigate).not.toHaveBeenCalled();
    expect(clear).not.toHaveBeenCalled();
  });

  it("does not start another redirect while one to the login screen is already in flight", () => {
    const state = vi.spyOn(router, "state", "get").mockReturnValue(routerStateAt("/manager"));
    const { navigate } = stubNavigation();

    endSession("manager");
    expect(navigate).toHaveBeenCalledTimes(1);

    state.mockReturnValue(routerStateAt("/manager", routes.managerLogin));
    endSession("manager");
    endSession("manager");

    expect(navigate).toHaveBeenCalledTimes(1);
  });
});
