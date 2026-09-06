import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter, RouterProvider, Outlet } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { routeChildren } from "./router";
import { ManagerShell } from "@/presentation/layout/ManagerShell";
import { useConsentStore } from "@/stores/consent.store";
import { useManagerSessionStore } from "@/stores/manager-session.store";
import { routes } from "@/presentation/lib/routes";
import { PHQ9_QUESTIONS } from "@/domain/assessment-scales/phq9";
import { GAD7_QUESTIONS } from "@/domain/assessment-scales/gad7";
import * as container from "./container";

// Reuses router.tsx's own route tree (routeChildren) rather than duplicating
// it, so this test can never silently drift from what actually ships.
function buildTestRouter(initialPath: string) {
  const router = createMemoryRouter(
    [
      {
        id: "root",
        path: "/",
        Component: () => <Outlet />,
        children: routeChildren,
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

describe("onboarding router flow", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    useConsentStore.setState({ hasConsented: false, consentedAt: null });
    useManagerSessionStore.setState({ token: null, expiresAt: null });
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

    await user.click(await screen.findByRole("button", { name: "Falar com um par" }));
    expect(await screen.findByText("Pares anônimos")).toBeInTheDocument();
  });

  it("the Configurações Administração entry reaches the manager login screen when unauthenticated", async () => {
    useConsentStore.setState({ hasConsented: true, consentedAt: "2026-01-01T00:00:00.000Z" });
    buildTestRouter("/home");
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Mais opções" }));
    await user.click(within(await screen.findByRole("dialog")).getByRole("link", { name: "Configurações" }));
    await user.click(await screen.findByRole("link", { name: "Administração" }));
    expect(await screen.findByText("Acesso do gestor")).toBeInTheDocument();
  });

  it("the manager login screen is still reachable by its own route", async () => {
    useConsentStore.setState({ hasConsented: true, consentedAt: "2026-01-01T00:00:00.000Z" });
    buildTestRouter("/manager/login");

    expect(await screen.findByText("Acesso do gestor")).toBeInTheDocument();
  });

  it("an authenticated manager session reaches the dashboard directly", async () => {
    useConsentStore.setState({ hasConsented: true, consentedAt: "2026-01-01T00:00:00.000Z" });
    useManagerSessionStore.setState({ token: "abc.def", expiresAt: new Date(Date.now() + 60_000).toISOString() });
    vi.spyOn(container.getManagerSignalsUseCase, "execute").mockResolvedValue({
      overallConcerningRate: 0,
      checkInsLast4Weeks: 0,
      weeklyTrend: [],
      segments: [],
      followUpResponseRate: 0,
    });

    buildTestRouter("/manager");

    expect(await screen.findByRole("heading", { level: 1, name: "Tendências" })).toBeInTheDocument();
  });

  it("keeps /manager/admin alive as a redirect, so links to the old tabbed page still land somewhere", async () => {
    useConsentStore.setState({ hasConsented: true, consentedAt: "2026-01-01T00:00:00.000Z" });
    useManagerSessionStore.setState({
      token: "abc.def",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      role: "HOSPITAL_ADMIN",
    });
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([]);

    buildTestRouter("/manager/admin");

    // The create-manager field now lives inside a modal rather than inline,
    // so the redirect is verified against the page heading instead.
    expect(await screen.findByRole("heading", { level: 1, name: "Gestores" })).toBeInTheDocument();
  });

  it("keeps Administração out of reach for a SECTOR_MANAGER, who sees the dashboard instead", async () => {
    useConsentStore.setState({ hasConsented: true, consentedAt: "2026-01-01T00:00:00.000Z" });
    useManagerSessionStore.setState({
      token: "abc.def",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      role: "SECTOR_MANAGER",
    });
    vi.spyOn(container.getManagerSignalsUseCase, "execute").mockResolvedValue({
      overallConcerningRate: 0,
      checkInsLast4Weeks: 0,
      weeklyTrend: [],
      segments: [],
      followUpResponseRate: 0,
    });

    buildTestRouter("/manager/admin/sectors");

    expect(await screen.findByRole("heading", { level: 1, name: "Tendências" })).toBeInTheDocument();
  });

  it.each([
    ["/manager/notifications", "Notificações"],
    ["/manager/settings", "Configurações"],
  ])("reaches the new %s route behind the manager guard", async (path, heading) => {
    useConsentStore.setState({ hasConsented: true, consentedAt: "2026-01-01T00:00:00.000Z" });
    useManagerSessionStore.setState({
      token: "abc.def",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      role: "HOSPITAL_ADMIN",
    });

    buildTestRouter(path);

    expect(await screen.findByRole("heading", { name: heading })).toBeInTheDocument();
  });

  it("an unauthenticated visit to /manager/history redirects to the manager login screen", async () => {
    useConsentStore.setState({ hasConsented: true, consentedAt: "2026-01-01T00:00:00.000Z" });

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
   * Session expiry is handled once, by ManagerShell. That only holds while
   * every manager page is actually a child of it — which is exactly what
   * drifted before, leaving three of six pages showing a table error with a
   * retry that could never succeed.
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
