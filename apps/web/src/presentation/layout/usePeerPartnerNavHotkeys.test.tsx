// apps/web/src/presentation/layout/usePeerPartnerNavHotkeys.test.tsx
import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { usePeerPartnerNavHotkeys } from "./usePeerPartnerNavHotkeys";
import { useHotkeyStore } from "@/stores/hotkey.store";
import { routes } from "@/presentation/lib/routes";

function Probe() {
  usePeerPartnerNavHotkeys();
  return null;
}

function renderAt(pathname: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route path={routes.peerPartnerInbox} element={<><Probe /><p>Inbox screen</p></>} />
        <Route path={routes.peerPartnerSettings} element={<p>Settings screen</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("usePeerPartnerNavHotkeys", () => {
  beforeEach(() => {
    useHotkeyStore.setState({ entries: new Map() });
  });

  it("registers both destinations", () => {
    renderAt(routes.peerPartnerInbox);
    const entries = useHotkeyStore.getState().entries;
    expect(entries.get("i")).toMatchObject({ label: "Início", scope: "global" });
    expect(entries.get("c")).toMatchObject({ label: "Configurações", scope: "global" });
  });

  it("navigates to Configurações when its hotkey fires", async () => {
    renderAt(routes.peerPartnerInbox);
    useHotkeyStore.getState().entries.get("c")?.handler();
    expect(await screen.findByText("Settings screen")).toBeInTheDocument();
  });
});
