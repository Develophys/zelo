import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { useManagerNavHotkeys } from "./useManagerNavHotkeys";
import { useHotkeyStore } from "@/stores/hotkey.store";
import { useManagerSessionStore } from "@/stores/manager-session.store";
import { routes } from "@/presentation/lib/routes";

function Probe() {
  useManagerNavHotkeys();
  return null;
}

function renderAt(pathname: string, role: "HOSPITAL_ADMIN" | "SECTOR_MANAGER" | null) {
  useManagerSessionStore.setState({ role });
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route path={routes.manager} element={<><Probe /><p>Trends screen</p></>} />
        <Route path={routes.managerNotifications} element={<p>Notifications screen</p>} />
        <Route path={routes.managerHistory} element={<p>History screen</p>} />
        <Route path={routes.managerMethodology} element={<p>Methodology screen</p>} />
        <Route path={routes.managerAdminManagers} element={<p>Managers screen</p>} />
        <Route path={routes.managerAdminSectors} element={<p>Sectors screen</p>} />
        <Route path={routes.managerAdminPeers} element={<p>Peers screen</p>} />
        <Route path={routes.managerSettings} element={<p>Settings screen</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("useManagerNavHotkeys", () => {
  beforeEach(() => {
    useHotkeyStore.setState({ entries: new Map() });
  });

  it("registers all eight destinations for a HOSPITAL_ADMIN", () => {
    renderAt(routes.manager, "HOSPITAL_ADMIN");
    const entries = useHotkeyStore.getState().entries;
    expect(entries.get("t")).toMatchObject({ label: "Tendências", scope: "global" });
    expect(entries.get("n")).toMatchObject({ label: "Notificações", scope: "global" });
    expect(entries.get("h")).toMatchObject({ label: "Análises com IA", scope: "global" });
    expect(entries.get("m")).toMatchObject({ label: "Como calculamos", scope: "global" });
    expect(entries.get("g")).toMatchObject({ label: "Gestores", scope: "global" });
    expect(entries.get("s")).toMatchObject({ label: "Setores", scope: "global" });
    expect(entries.get("p")).toMatchObject({ label: "Pares anônimos", scope: "global" });
    expect(entries.get("c")).toMatchObject({ label: "Configurações", scope: "global" });
  });

  it("does not register the three admin destinations for a SECTOR_MANAGER", () => {
    renderAt(routes.manager, "SECTOR_MANAGER");
    const entries = useHotkeyStore.getState().entries;
    expect(entries.has("g")).toBe(false);
    expect(entries.has("s")).toBe(false);
    expect(entries.has("p")).toBe(false);
    expect(entries.get("t")).toMatchObject({ label: "Tendências" });
  });

  it("navigates to Notificações when its hotkey fires", async () => {
    renderAt(routes.manager, "HOSPITAL_ADMIN");
    useHotkeyStore.getState().entries.get("n")?.handler();
    expect(await screen.findByText("Notifications screen")).toBeInTheDocument();
  });

  it("navigates to Gestores when its hotkey fires, for a HOSPITAL_ADMIN", async () => {
    renderAt(routes.manager, "HOSPITAL_ADMIN");
    useHotkeyStore.getState().entries.get("g")?.handler();
    expect(await screen.findByText("Managers screen")).toBeInTheDocument();
  });
});
