import { beforeEach, describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
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
        <Route path={routes.assessment} element={<p>Check-in screen</p>} />
        <Route path={routes.chat} element={<p>Chat screen</p>} />
        <Route path={routes.crisis} element={<p>Crisis screen</p>} />
        <Route path={routes.you} element={<p>You screen</p>} />
        <Route path={routes.settings} element={<p>Settings screen</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

const DESTINATIONS = [
  { id: "home", key: "i", label: "Início", route: routes.home, screenText: "Home screen" },
  { id: "checkin", key: "k", label: "Check-in", route: routes.assessment, screenText: "Check-in screen" },
  { id: "chat", key: "c", label: "Conversar", route: routes.chat, screenText: "Chat screen" },
  { id: "apoio", key: "a", label: "Apoio", route: routes.crisis, screenText: "Crisis screen" },
  { id: "you", key: "v", label: "Você", route: routes.you, screenText: "You screen" },
  { id: "settings", key: "g", label: "Configurações", route: routes.settings, screenText: "Settings screen" },
];

describe("useNavHotkeys", () => {
  beforeEach(() => {
    useHotkeyStore.setState({ entries: new Map(), helpOpen: false });
  });

  it("registers a global hotkey for every médico destination and Configurações", () => {
    renderAt(routes.home);
    const entries = useHotkeyStore.getState().entries;
    for (const destination of DESTINATIONS) {
      expect(entries.get(destination.key)).toMatchObject({ label: destination.label, scope: "global" });
    }
  });

  it.each(DESTINATIONS)(
    "navigates to $label's route when '$key' fires",
    async ({ key, screenText }) => {
      renderAt(routes.home);
      // useNavHotkeys only registers; calling the handler directly proves the
      // wiring without depending on HotkeyListener also being mounted here —
      // that dispatch path is HotkeyListener's own responsibility, covered by
      // its own tests, and end-to-end by Task 6's Sidebar/BottomNav tests.
      useHotkeyStore.getState().entries.get(key)?.handler();

      expect(await screen.findByText(screenText)).toBeInTheDocument();
    },
  );
});
