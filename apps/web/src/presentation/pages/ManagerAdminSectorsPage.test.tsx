import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ManagerAdminSectorsPage } from "./ManagerAdminSectorsPage";
import * as container from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/manager/admin/sectors"]}>
        <Routes>
          <Route path="/manager/admin/sectors" element={<ManagerAdminSectorsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ManagerAdminSectorsPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
    useManagerSessionStore.getState().setSession("token", new Date(Date.now() + 60_000).toISOString(), "HOSPITAL_ADMIN");
  });

  it("lets an admin create a sector", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.createSectorUseCase, "execute").mockResolvedValue({ id: "sector-1", name: "UTI" });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "+ Adicionar setor" }));
    await user.type(screen.getByLabelText("Nome do setor"), "UTI");
    await user.click(screen.getByRole("button", { name: "Salvar" }));

    await waitFor(() => expect(container.createSectorUseCase.execute).toHaveBeenCalledWith("token", "UTI"));
  });

  it("assigns a manager to a sector from the edit modal", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([
      { id: "sector-1", name: "UTI", isActive: true, managerId: null, managerName: null },
    ]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([
      { id: "manager-5", name: "Paulo", email: "paulo@zelo-demo.local", role: "SECTOR_MANAGER", isActive: true, sectorNames: [], hasPassword: true, setPasswordTokenExpiresAt: null },
    ]);
    vi.spyOn(container.updateSectorUseCase, "execute").mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    const table = within(await screen.findByRole("table"));
    await user.click(table.getByRole("button", { name: "Editar UTI" }));
    await user.selectOptions(screen.getByLabelText("Gestor responsável"), "manager-5");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(container.updateSectorUseCase.execute).toHaveBeenCalledWith("token", "sector-1", { managerId: "manager-5" }),
    );
  });

  it("clears a sector's manager assignment through the edit modal", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([
      { id: "sector-1", name: "UTI", isActive: true, managerId: "manager-5", managerName: "Paulo" },
    ]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([
      { id: "manager-5", name: "Paulo", email: "paulo@zelo-demo.local", role: "SECTOR_MANAGER", isActive: true, sectorNames: ["UTI"], hasPassword: true, setPasswordTokenExpiresAt: null },
    ]);
    vi.spyOn(container.updateSectorUseCase, "execute").mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    const table = within(await screen.findByRole("table"));
    await user.click(table.getByRole("button", { name: "Editar UTI" }));
    await user.selectOptions(screen.getByLabelText("Gestor responsável"), "");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(container.updateSectorUseCase.execute).toHaveBeenCalledWith("token", "sector-1", { managerId: null }),
    );
  });

  it('renders the page header with its normative intro', async () => {
    vi.spyOn(container.listSectorsUseCase, 'execute').mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, 'execute').mockResolvedValue([]);
    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'Setores' })).toBeInTheDocument();
    expect(
      screen.getByText('Áreas do hospital acompanhadas pelo Zelo. Cada setor pode ter um gestor responsável.'),
    ).toBeInTheDocument();
  });

  it('creates a sector with its responsible manager in one modal, not two steps', async () => {
    vi.spyOn(container.listSectorsUseCase, 'execute').mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, 'execute').mockResolvedValue([
      { id: 'm1', name: 'Ana', email: 'ana@zelo-demo.local', role: 'HOSPITAL_ADMIN', isActive: true, sectorNames: [], hasPassword: true, setPasswordTokenExpiresAt: null },
    ]);
    const createSector = vi
      .spyOn(container.createSectorUseCase, 'execute')
      .mockResolvedValue({ id: 's1', name: 'UTI' });
    const updateSector = vi.spyOn(container.updateSectorUseCase, 'execute').mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: '+ Adicionar setor' }));
    await user.type(screen.getByLabelText('Nome do setor'), 'UTI');
    await user.selectOptions(screen.getByLabelText('Gestor responsável'), 'm1');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(createSector).toHaveBeenCalledWith('token', 'UTI'));
    await waitFor(() =>
      expect(updateSector).toHaveBeenCalledWith('token', 's1', { managerId: 'm1' }),
    );
  });

  it('cannot be submitted without a name', async () => {
    vi.spyOn(container.listSectorsUseCase, 'execute').mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, 'execute').mockResolvedValue([]);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: '+ Adicionar setor' }));
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
  });

  it('points at Gestores when there is nobody to assign', async () => {
    vi.spyOn(container.listSectorsUseCase, 'execute').mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, 'execute').mockResolvedValue([]);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: '+ Adicionar setor' }));
    expect(screen.queryByLabelText('Gestor responsável')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cadastrar um gestor' })).toHaveAttribute(
      'href',
      '/manager/admin/managers',
    );
  });
});
