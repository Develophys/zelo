import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { useNavHotkeys } from "./useNavHotkeys";
import { useHotkeyStore } from "@/stores/hotkey.store";
import { routes } from "@/presentation/lib/routes";

function Probe() {
  useNavHotkeys();
  return null;
}

function renderAt(pathname: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route path={routes.home} element={<><Probe /><p>Home screen</p></>} />
        <Route path={routes.chat} element={<p>Chat screen</p>} />
        <Route path={routes.crisis} element={<p>Crisis screen</p>} />
        <Route path={routes.settings} element={<p>Settings screen</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("useNavHotkeys", () => {
  beforeEach(() => {
    useHotkeyStore.setState({ entries: new Map() });
  });

  it("registers a global hotkey for every médico destination and Configurações", () => {
    renderAt(routes.home);
    const entries = useHotkeyStore.getState().entries;
    expect(entries.get("i")).toMatchObject({ label: "Início", scope: "global" });
    expect(entries.get("c")).toMatchObject({ label: "Conversar", scope: "global" });
    expect(entries.get("g")).toMatchObject({ label: "Configurações", scope: "global" });
  });

  it("navigates to a destination's route when its hotkey fires", async () => {
    renderAt(routes.home);
    // useNavHotkeys only registers; calling the handler directly proves the
    // wiring without depending on HotkeyListener also being mounted here —
    // that dispatch path is HotkeyListener's own responsibility, covered by
    // its own tests, and end-to-end by Task 6's Sidebar/BottomNav tests.
    useHotkeyStore.getState().entries.get("c")?.handler();

    expect(await screen.findByText("Chat screen")).toBeInTheDocument();
  });

  it("navigates to Apoio when its hotkey fires", async () => {
    renderAt(routes.home);
    useHotkeyStore.getState().entries.get("a")?.handler();
    expect(await screen.findByText("Crisis screen")).toBeInTheDocument();
  });

  it("navigates to Configurações when its hotkey fires", async () => {
    renderAt(routes.home);
    useHotkeyStore.getState().entries.get("g")?.handler();
    expect(await screen.findByText("Settings screen")).toBeInTheDocument();
  });
});
