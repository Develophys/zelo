import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
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

  it("switches to the managers tab and creates a SECTOR_MANAGER with the selected sectors", async () => {
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
    await user.click(screen.getByLabelText("Gestor de setor"));
    await user.click(await screen.findByLabelText("UTI"));
    await user.click(screen.getByRole("button", { name: "Adicionar gestor" }));

    await waitFor(() =>
      expect(container.createManagerAdminUseCase.execute).toHaveBeenCalledWith("token", {
        name: "Paulo",
        role: "SECTOR_MANAGER",
        sectorIds: ["sector-1"],
      }),
    );
    await waitFor(() => expect(screen.getByText("temp-pass-123")).toBeInTheDocument());
  });

  it("creates a HOSPITAL_ADMIN by default, without a role change", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.createManagerAdminUseCase, "execute").mockResolvedValue({
      manager: { id: "manager-3", name: "Ana" },
      temporaryPassword: "temp-pass-456",
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Gestores" }));
    await user.type(screen.getByLabelText("Nome do gestor"), "Ana");
    await user.click(screen.getByRole("button", { name: "Adicionar gestor" }));

    await waitFor(() =>
      expect(container.createManagerAdminUseCase.execute).toHaveBeenCalledWith("token", {
        name: "Ana",
        role: "HOSPITAL_ADMIN",
        sectorIds: undefined,
      }),
    );
  });

  it("resets a manager's password and reveals the new temporary password once", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([
      { id: "manager-5", name: "Paulo", role: "SECTOR_MANAGER", isActive: true, sectorNames: ["UTI"] },
    ]);
    vi.spyOn(container.resetManagerPasswordUseCase, "execute").mockResolvedValue({ temporaryPassword: "nova-senha-789" });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Gestores" }));
    await user.click(await screen.findByRole("button", { name: "Redefinir senha de Paulo" }));

    await waitFor(() => expect(container.resetManagerPasswordUseCase.execute).toHaveBeenCalledWith("token", "manager-5"));
    await waitFor(() => expect(screen.getByText("nova-senha-789")).toBeInTheDocument());
    expect(screen.getByText(/Senha temporária de Paulo/)).toBeInTheDocument();
  });

  it("assigns a manager to a sector from the sector row's selector", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([
      { id: "sector-1", name: "UTI", isActive: true, managerId: null, managerName: null },
    ]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([
      { id: "manager-5", name: "Paulo", role: "SECTOR_MANAGER", isActive: true, sectorNames: [] },
    ]);
    vi.spyOn(container.updateSectorUseCase, "execute").mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(await screen.findByLabelText("Gestor de UTI"), "manager-5");

    await waitFor(() =>
      expect(container.updateSectorUseCase.execute).toHaveBeenCalledWith("token", "sector-1", { managerId: "manager-5" }),
    );
  });

  it("clears a sector's manager assignment through the same selector", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([
      { id: "sector-1", name: "UTI", isActive: true, managerId: "manager-5", managerName: "Paulo" },
    ]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([
      { id: "manager-5", name: "Paulo", role: "SECTOR_MANAGER", isActive: true, sectorNames: ["UTI"] },
    ]);
    vi.spyOn(container.updateSectorUseCase, "execute").mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.selectOptions(await screen.findByLabelText("Gestor de UTI"), "");

    await waitFor(() =>
      expect(container.updateSectorUseCase.execute).toHaveBeenCalledWith("token", "sector-1", { managerId: null }),
    );
  });

  it("edits an existing manager's role and sectors inline, pre-filled from their current assignment", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([
      { id: "sector-1", name: "UTI", isActive: true, managerId: null, managerName: null },
      { id: "sector-2", name: "Pronto-Socorro", isActive: true, managerId: null, managerName: null },
    ]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([
      { id: "manager-5", name: "Paulo", role: "SECTOR_MANAGER", isActive: true, sectorNames: ["UTI"] },
    ]);
    vi.spyOn(container.updateManagerAdminUseCase, "execute").mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Gestores" }));
    await user.click(await screen.findByRole("button", { name: "Editar Paulo" }));

    const editForm = within(screen.getByRole("group", { name: "Editando Paulo" }));
    expect(editForm.getByLabelText("Gestor de setor")).toBeChecked();
    expect(editForm.getByLabelText("UTI")).toBeChecked();
    expect(editForm.getByLabelText("Pronto-Socorro")).not.toBeChecked();

    await user.click(editForm.getByLabelText("Pronto-Socorro"));
    await user.click(editForm.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(container.updateManagerAdminUseCase.execute).toHaveBeenCalledWith("token", "manager-5", {
        role: "SECTOR_MANAGER",
        sectorIds: ["sector-1", "sector-2"],
      }),
    );
    await waitFor(() => expect(screen.queryByRole("group", { name: "Editando Paulo" })).not.toBeInTheDocument());
  });

  it("promotes an existing manager to hospital admin from the inline edit form", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([
      { id: "sector-1", name: "UTI", isActive: true, managerId: null, managerName: null },
    ]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([
      { id: "manager-5", name: "Paulo", role: "SECTOR_MANAGER", isActive: true, sectorNames: ["UTI"] },
    ]);
    vi.spyOn(container.updateManagerAdminUseCase, "execute").mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Gestores" }));
    await user.click(await screen.findByRole("button", { name: "Editar Paulo" }));

    const editForm = within(screen.getByRole("group", { name: "Editando Paulo" }));
    await user.click(editForm.getByLabelText("Gestor do hospital"));
    await user.click(editForm.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(container.updateManagerAdminUseCase.execute).toHaveBeenCalledWith("token", "manager-5", {
        role: "HOSPITAL_ADMIN",
        sectorIds: undefined,
      }),
    );
  });

  it("discards inline edits on Cancelar without calling the update mutation", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([
      { id: "sector-1", name: "UTI", isActive: true, managerId: null, managerName: null },
    ]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([
      { id: "manager-5", name: "Paulo", role: "SECTOR_MANAGER", isActive: true, sectorNames: ["UTI"] },
    ]);
    const updateSpy = vi.spyOn(container.updateManagerAdminUseCase, "execute").mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Gestores" }));
    await user.click(await screen.findByRole("button", { name: "Editar Paulo" }));
    await user.click(within(screen.getByRole("group", { name: "Editando Paulo" })).getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("group", { name: "Editando Paulo" })).not.toBeInTheDocument();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it("switches to the peer-partners tab and creates one", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.listPeerPartnersUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.createPeerPartnerUseCase, "execute").mockResolvedValue({
      peerPartner: { id: "peer-1", name: "Dra. Ana" },
      temporaryPassword: "temp-pass-456",
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Pares Anônimos" }));
    await user.type(screen.getByLabelText("Nome do par"), "Dra. Ana");
    await user.type(screen.getByLabelText("Especialidade"), "Clínica médica");
    await user.click(screen.getByRole("button", { name: "Adicionar par" }));

    await waitFor(() => expect(screen.getByText("temp-pass-456")).toBeInTheDocument());
  });

  it("resets a peer partner's password and reveals the new temporary password once", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.listPeerPartnersUseCase, "execute").mockResolvedValue([
      { id: "peer-5", name: "Dr. Paulo", specialty: "Clínica médica", isActive: true },
    ]);
    vi.spyOn(container.resetPeerPartnerPasswordUseCase, "execute").mockResolvedValue({ temporaryPassword: "nova-senha-321" });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "Pares Anônimos" }));
    await user.click(await screen.findByRole("button", { name: "Redefinir senha de Dr. Paulo" }));

    await waitFor(() => expect(container.resetPeerPartnerPasswordUseCase.execute).toHaveBeenCalledWith("token", "peer-5"));
    await waitFor(() => expect(screen.getByText("nova-senha-321")).toBeInTheDocument());
    expect(screen.getByText(/Senha temporária de Dr. Paulo/)).toBeInTheDocument();
  });
});
