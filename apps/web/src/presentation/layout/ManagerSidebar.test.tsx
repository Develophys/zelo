import { beforeEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ManagerSidebar } from "./ManagerSidebar";
import { HotkeyListener } from "./HotkeyListener";
import { useHotkeyStore } from "@/stores/hotkey.store";
import { useManagerSessionStore } from "@/stores/manager-session.store";
import { routes } from "@/presentation/lib/routes";

describe("ManagerSidebar hotkeys", () => {
  beforeEach(() => {
    window.localStorage.clear();
    useHotkeyStore.setState({ entries: new Map() });
    useManagerSessionStore.setState({ role: "HOSPITAL_ADMIN" });
  });

  it("navigates to Setores when its hotkey fires", async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[routes.manager]}>
          <Routes>
            <Route path={routes.manager} element={<><ManagerSidebar /><HotkeyListener /></>} />
            <Route path={routes.managerAdminSectors} element={<p>Sectors screen</p>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    fireEvent.keyDown(document, { key: "s" });

    expect(await screen.findByText("Sectors screen")).toBeInTheDocument();
  });
});
