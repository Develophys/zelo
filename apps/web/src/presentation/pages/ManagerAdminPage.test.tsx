import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ManagerAdminPage } from "./ManagerAdminPage";
import * as container from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/manager/admin"]}>
        <Routes>
          <Route path="/manager/admin" element={<ManagerAdminPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ManagerAdminPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
    useManagerSessionStore.getState().setSession("token", new Date(Date.now() + 60_000).toISOString(), "HOSPITAL_ADMIN");
  });

  it("shows sectors by default and lets an admin create one", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.createSectorUseCase, "execute").mockResolvedValue({ id: "sector-1", name: "UTI" });
    const user = userEvent.setup();
    renderPage();

    await user.type(await screen.findByLabelText("Nome do setor"), "UTI");
    await user.click(screen.getByRole("button", { name: "Adicionar setor" }));

    await waitFor(() => expect(container.createSectorUseCase.execute).toHaveBeenCalledWith("token", "UTI"));
  });

  it("switches to the managers tab and creates a SECTOR_MANAGER", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([
      { id: "sector-1", name: "UTI", isActive: true, managerId: null, managerName: null },
    ]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.createManagerAdminUseCase, "execute").mockResolvedValue({
      manager: { id: "manager-2", name: "Paulo" },
      temporaryPassword: "temp-pass-123",
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Gestores" }));
    await user.type(screen.getByLabelText("Nome do gestor"), "Paulo");
    await user.click(screen.getByRole("button", { name: "Adicionar gestor" }));

    await waitFor(() => expect(screen.getByText("temp-pass-123")).toBeInTheDocument());
  });
});
