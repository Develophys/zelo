import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ManagerAdminSectorsPage } from "./ManagerAdminSectorsPage";
import * as container from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";
import { useToastStore } from "@/stores/toast.store";
import {
  AdminDeleteConflictError,
  SectorInviteCodeConflictError,
  SectorNameConflictError,
} from "@/ports/manager-admin.port";
import { HotkeyListener } from "@/presentation/layout/HotkeyListener";
import { useHotkeyStore } from "@/stores/hotkey.store";

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/manager/admin/sectors"]}>
        <Routes>
          <Route
            path="/manager/admin/sectors"
            element={
              <>
                <ManagerAdminSectorsPage />
                <HotkeyListener />
              </>
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ManagerAdminSectorsPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
    useManagerSessionStore.getState().setSession("token", new Date(Date.now() + 60_000).toISOString(), "HOSPITAL_ADMIN");
    useToastStore.getState().clear();
    useHotkeyStore.setState({ entries: new Map(), helpOpen: false });
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

    await waitFor(() =>
      expect(container.createSectorUseCase.execute).toHaveBeenCalledWith("token", { name: "UTI" }),
    );
  });

  it("assigns a manager to a sector from the edit modal", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([
      { id: "sector-1", name: "UTI", isActive: true, managerId: null, managerName: null, inviteCode: null },
    ]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([
      { id: "manager-5", name: "Paulo", email: "paulo@zelo-demo.local", role: "SECTOR_MANAGER", isActive: true, sectorIds: [], sectorNames: [], hasPassword: true, setPasswordTokenExpiresAt: null },
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
      { id: "sector-1", name: "UTI", isActive: true, managerId: "manager-5", managerName: "Paulo", inviteCode: null },
    ]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([
      { id: "manager-5", name: "Paulo", email: "paulo@zelo-demo.local", role: "SECTOR_MANAGER", isActive: true, sectorIds: [], sectorNames: ["UTI"], hasPassword: true, setPasswordTokenExpiresAt: null },
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

  it("lets an admin set an invite code while editing a sector that has none yet", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([
      { id: "sector-1", name: "UTI", isActive: true, managerId: null, managerName: null, inviteCode: null },
    ]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.updateSectorUseCase, "execute").mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    const table = within(await screen.findByRole("table"));
    await user.click(table.getByRole("button", { name: "Editar UTI" }));
    const inviteCodeField = screen.getByLabelText("Código de convite (opcional)");
    expect(inviteCodeField).toBeEnabled();
    await user.type(inviteCodeField, "uti-2026");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(container.updateSectorUseCase.execute).toHaveBeenCalledWith("token", "sector-1", {
        managerId: null,
        inviteCode: "uti-2026",
      }),
    );
  });

  it("disables the invite code field once a sector already has one", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([
      { id: "sector-1", name: "UTI", isActive: true, managerId: null, managerName: null, inviteCode: "uti-2026" },
    ]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([]);
    const user = userEvent.setup();
    renderPage();

    const table = within(await screen.findByRole("table"));
    await user.click(table.getByRole("button", { name: "Editar UTI" }));

    expect(screen.getByLabelText("Código de convite (opcional)")).toBeDisabled();
  });

  it("never resends an unchanged existing invite code when saving other edits", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([
      { id: "sector-1", name: "UTI", isActive: true, managerId: null, managerName: null, inviteCode: "uti-2026" },
    ]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([
      { id: "manager-5", name: "Paulo", email: "paulo@zelo-demo.local", role: "SECTOR_MANAGER", isActive: true, sectorIds: [], sectorNames: [], hasPassword: true, setPasswordTokenExpiresAt: null },
    ]);
    vi.spyOn(container.updateSectorUseCase, "execute").mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    const table = within(await screen.findByRole("table"));
    await user.click(table.getByRole("button", { name: "Editar UTI" }));
    await user.selectOptions(screen.getByLabelText("Gestor responsável"), "manager-5");
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(container.updateSectorUseCase.execute).toHaveBeenCalledWith("token", "sector-1", {
        managerId: "manager-5",
      }),
    );
  });

  it("shows a 'Ver QR Code' action only enabled when the sector has a code", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([
      { id: "s1", name: "UTI", isActive: true, managerId: null, managerName: null, inviteCode: "uti-2026" },
      { id: "s2", name: "PS", isActive: true, managerId: null, managerName: null, inviteCode: null },
    ]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([]);
    renderPage();

    const table = within(await screen.findByRole("table"));
    expect(table.getByRole("button", { name: "Ver QR Code de UTI" })).toBeEnabled();
    expect(table.getByRole("button", { name: "Ver QR Code de PS" })).toBeDisabled();
  });

  it("opens the SectorQrCodeModal with the sector's code when 'Ver QR Code' is clicked", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([
      { id: "s1", name: "UTI", isActive: true, managerId: null, managerName: null, inviteCode: "uti-2026" },
    ]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([]);
    renderPage();

    const table = within(await screen.findByRole("table"));
    fireEvent.click(table.getByRole("button", { name: "Ver QR Code de UTI" }));

    await waitFor(() => screen.getByTestId("sector-qr-canvas"));
    expect(screen.getByText("QR Code — UTI")).toBeInTheDocument();
  });

  it('anchors + Adicionar setor to the right of the table\'s own search row', async () => {
    vi.spyOn(container.listSectorsUseCase, 'execute').mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, 'execute').mockResolvedValue([]);
    renderPage();

    const toolbar = await screen.findByTestId('data-table-toolbar');
    const slot = within(toolbar).getByTestId('data-table-toolbar-action');
    expect(within(slot).getByRole('button', { name: '+ Adicionar setor' })).toBeInTheDocument();
    expect(slot.className).toContain('ml-auto');
    expect(document.querySelector('hr')).toBeNull();
  });

  it('creates a sector with its responsible manager in one modal, not two steps', async () => {
    vi.spyOn(container.listSectorsUseCase, 'execute').mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, 'execute').mockResolvedValue([
      { id: 'm1', name: 'Ana', email: 'ana@zelo-demo.local', role: 'HOSPITAL_ADMIN', isActive: true, sectorIds: [], sectorNames: [], hasPassword: true, setPasswordTokenExpiresAt: null },
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

    await waitFor(() => expect(createSector).toHaveBeenCalledWith('token', { name: 'UTI' }));
    await waitFor(() =>
      expect(updateSector).toHaveBeenCalledWith('token', 's1', { managerId: 'm1' }),
    );
  });

  it('lets the gestor type an invite code when creating a sector', async () => {
    vi.spyOn(container.listSectorsUseCase, 'execute').mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, 'execute').mockResolvedValue([]);
    const createSector = vi
      .spyOn(container.createSectorUseCase, 'execute')
      .mockResolvedValue({ id: 's1', name: 'UTI' });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: '+ Adicionar setor' }));
    await user.type(screen.getByLabelText('Nome do setor'), 'UTI');
    await user.type(screen.getByLabelText('Código de convite (opcional)'), 'uti-2026');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(createSector).toHaveBeenCalledWith('token', { name: 'UTI', inviteCode: 'uti-2026' }),
    );
  });

  it('shows an invite-code conflict message when the code is already taken', async () => {
    vi.spyOn(container.listSectorsUseCase, 'execute').mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, 'execute').mockResolvedValue([]);
    vi.spyOn(container.createSectorUseCase, 'execute').mockRejectedValue(new SectorInviteCodeConflictError());
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: '+ Adicionar setor' }));
    await user.type(screen.getByLabelText('Nome do setor'), 'UTI');
    await user.type(screen.getByLabelText('Código de convite (opcional)'), 'uti-2026');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Já existe um setor com esse código.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
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

  it('shows a conflict message when the sector name already exists and keeps the modal open', async () => {
    vi.spyOn(container.listSectorsUseCase, 'execute').mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, 'execute').mockResolvedValue([]);
    vi.spyOn(container.createSectorUseCase, 'execute').mockRejectedValue(new SectorNameConflictError());
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: '+ Adicionar setor' }));
    await user.type(screen.getByLabelText('Nome do setor'), 'UTI');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Já existe um setor com esse nome.');
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('leaves the sector created and shows a notice, without retrying creation, when assigning the manager fails', async () => {
    vi.spyOn(container.listSectorsUseCase, 'execute').mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, 'execute').mockResolvedValue([
      { id: 'm1', name: 'Ana', email: 'ana@zelo-demo.local', role: 'HOSPITAL_ADMIN', isActive: true, sectorIds: [], sectorNames: [], hasPassword: true, setPasswordTokenExpiresAt: null },
    ]);
    const createSector = vi
      .spyOn(container.createSectorUseCase, 'execute')
      .mockResolvedValue({ id: 's1', name: 'UTI' });
    vi.spyOn(container.updateSectorUseCase, 'execute').mockRejectedValue(new Error('assignment failed'));
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: '+ Adicionar setor' }));
    await user.type(screen.getByLabelText('Nome do setor'), 'UTI');
    await user.selectOptions(screen.getByLabelText('Gestor responsável'), 'm1');
    await user.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(
      await screen.findByText(
        'Setor "UTI" criado, mas não foi possível atribuir o gestor. Edite o setor para tentar de novo.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(createSector).toHaveBeenCalledTimes(1);

    // A subsequent interaction (reopening the create form) must not replay
    // the creation that already succeeded — the sector exists, only its
    // manager assignment failed.
    createSector.mockClear();
    await user.click(screen.getByRole('button', { name: '+ Adicionar setor' }));
    expect(createSector).not.toHaveBeenCalled();
  });

  it('deletes the selected sectors and closes the dialog on the happy path', async () => {
    vi.spyOn(container.listSectorsUseCase, 'execute').mockResolvedValue([
      { id: 'sector-1', name: 'UTI', isActive: true, managerId: null, managerName: null, inviteCode: null },
      { id: 'sector-2', name: 'Pronto-Socorro', isActive: true, managerId: null, managerName: null, inviteCode: null },
    ]);
    vi.spyOn(container.listManagersUseCase, 'execute').mockResolvedValue([]);
    const deleteSpy = vi.spyOn(container.deleteSectorAdminUseCase, 'execute').mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('checkbox', { name: 'Selecionar UTI' }));
    await user.click(screen.getByRole('checkbox', { name: 'Selecionar Pronto-Socorro' }));
    await user.click(screen.getByRole('button', { name: 'Excluir' }));

    const dialog = within(await screen.findByRole('dialog', { name: 'Excluir 2 setores?' }));
    await user.click(dialog.getByRole('button', { name: 'Excluir' }));

    await waitFor(() => expect(deleteSpy).toHaveBeenCalledTimes(2));
    expect(deleteSpy).toHaveBeenNthCalledWith(1, 'token', 'sector-1');
    expect(deleteSpy).toHaveBeenNthCalledWith(2, 'token', 'sector-2');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('keeps the delete dialog open and renders the refusal sentence when a sector has check-in history', async () => {
    vi.spyOn(container.listSectorsUseCase, 'execute').mockResolvedValue([
      { id: 'sector-1', name: 'UTI', isActive: true, managerId: null, managerName: null, inviteCode: null },
    ]);
    vi.spyOn(container.listManagersUseCase, 'execute').mockResolvedValue([]);
    vi.spyOn(container.deleteSectorAdminUseCase, 'execute').mockRejectedValue(
      new AdminDeleteConflictError('SECTOR_HAS_HISTORY'),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('checkbox', { name: 'Selecionar UTI' }));
    await user.click(screen.getByRole('button', { name: 'Excluir' }));

    const dialog = within(await screen.findByRole('dialog', { name: 'Excluir UTI?' }));
    await user.click(dialog.getByRole('button', { name: 'Excluir' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Este setor tem histórico de check-ins e não pode ser excluído. Pause-o para tirá-lo do painel.',
    );
    // The refusal is read where it happened, not closed away.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('reports a partial bulk delete and retries only the still-failing id', async () => {
    vi.spyOn(container.listSectorsUseCase, 'execute').mockResolvedValue([
      { id: 'sector-1', name: 'UTI', isActive: true, managerId: null, managerName: null, inviteCode: null },
      { id: 'sector-2', name: 'Pronto-Socorro', isActive: true, managerId: null, managerName: null, inviteCode: null },
    ]);
    vi.spyOn(container.listManagersUseCase, 'execute').mockResolvedValue([]);
    const deleteSpy = vi
      .spyOn(container.deleteSectorAdminUseCase, 'execute')
      .mockImplementation(async (_token: string, id: string) => {
        if (id === 'sector-2') throw new AdminDeleteConflictError('SECTOR_HAS_HISTORY');
      });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('checkbox', { name: 'Selecionar UTI' }));
    await user.click(screen.getByRole('checkbox', { name: 'Selecionar Pronto-Socorro' }));
    await user.click(screen.getByRole('button', { name: 'Excluir' }));

    await screen.findByRole('dialog', { name: 'Excluir 2 setores?' });
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Excluir' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '1 de 2 excluídos. Este setor tem histórico de check-ins e não pode ser excluído. Pause-o para tirá-lo do painel.',
    );
    // The dialog narrows to just the still-failing sector, so a retry
    // doesn't re-attempt the one that already succeeded — and now names it.
    expect(screen.getByRole('dialog', { name: 'Excluir Pronto-Socorro?' })).toBeInTheDocument();

    deleteSpy.mockClear();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Excluir' }));

    await waitFor(() => expect(deleteSpy).toHaveBeenCalledTimes(1));
    expect(deleteSpy).toHaveBeenCalledWith('token', 'sector-2');
  });

  it('pauses the selected sectors and clears the selection on the happy path', async () => {
    vi.spyOn(container.listSectorsUseCase, 'execute').mockResolvedValue([
      { id: 'sector-1', name: 'UTI', isActive: true, managerId: null, managerName: null, inviteCode: null },
      { id: 'sector-2', name: 'Pronto-Socorro', isActive: true, managerId: null, managerName: null, inviteCode: null },
    ]);
    vi.spyOn(container.listManagersUseCase, 'execute').mockResolvedValue([]);
    const updateSpy = vi.spyOn(container.updateSectorUseCase, 'execute').mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('checkbox', { name: 'Selecionar UTI' }));
    await user.click(screen.getByRole('checkbox', { name: 'Selecionar Pronto-Socorro' }));
    await user.click(screen.getByRole('button', { name: 'Pausar' }));

    await waitFor(() => expect(updateSpy).toHaveBeenCalledTimes(2));
    expect(updateSpy).toHaveBeenNthCalledWith(1, 'token', 'sector-1', { isActive: false });
    expect(updateSpy).toHaveBeenNthCalledWith(2, 'token', 'sector-2', { isActive: false });
    // Selection cleared: the toolbar falls back to its search field.
    await waitFor(() => expect(screen.getByPlaceholderText('Buscar…')).toBeInTheDocument());
  });

  it('raises a success toast naming the count and noun when a bulk pause succeeds', async () => {
    vi.spyOn(container.listSectorsUseCase, 'execute').mockResolvedValue([
      { id: 'sector-1', name: 'UTI', isActive: true, managerId: null, managerName: null, inviteCode: null },
      { id: 'sector-2', name: 'Pronto-Socorro', isActive: true, managerId: null, managerName: null, inviteCode: null },
    ]);
    vi.spyOn(container.listManagersUseCase, 'execute').mockResolvedValue([]);
    vi.spyOn(container.updateSectorUseCase, 'execute').mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('checkbox', { name: 'Selecionar UTI' }));
    await user.click(screen.getByRole('checkbox', { name: 'Selecionar Pronto-Socorro' }));
    await user.click(screen.getByRole('button', { name: 'Pausar' }));

    await waitFor(() =>
      expect(useToastStore.getState().toasts).toEqual([
        expect.objectContaining({ tone: 'success', message: '2 setores pausados.' }),
      ]),
    );
  });

  it('raises a success toast when a bulk delete succeeds', async () => {
    vi.spyOn(container.listSectorsUseCase, 'execute').mockResolvedValue([
      { id: 'sector-1', name: 'UTI', isActive: true, managerId: null, managerName: null, inviteCode: null },
    ]);
    vi.spyOn(container.listManagersUseCase, 'execute').mockResolvedValue([]);
    vi.spyOn(container.deleteSectorAdminUseCase, 'execute').mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('checkbox', { name: 'Selecionar UTI' }));
    await user.click(screen.getByRole('button', { name: 'Excluir' }));
    const dialog = within(await screen.findByRole('dialog', { name: 'Excluir UTI?' }));
    await user.click(dialog.getByRole('button', { name: 'Excluir' }));

    await waitFor(() =>
      expect(useToastStore.getState().toasts).toEqual([
        expect.objectContaining({ tone: 'success', message: '1 setor excluído.' }),
      ]),
    );
  });

  it('reports a partial bulk pause and keeps the selection so the still-active sector can be retried', async () => {
    vi.spyOn(container.listSectorsUseCase, 'execute').mockResolvedValue([
      { id: 'sector-1', name: 'UTI', isActive: true, managerId: null, managerName: null, inviteCode: null },
      { id: 'sector-2', name: 'Pronto-Socorro', isActive: true, managerId: null, managerName: null, inviteCode: null },
    ]);
    vi.spyOn(container.listManagersUseCase, 'execute').mockResolvedValue([]);
    vi.spyOn(container.updateSectorUseCase, 'execute').mockImplementation(async (_token: string, id: string) => {
      if (id === 'sector-2') throw new Error('network down');
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('checkbox', { name: 'Selecionar UTI' }));
    await user.click(screen.getByRole('checkbox', { name: 'Selecionar Pronto-Socorro' }));
    await user.click(screen.getByRole('button', { name: 'Pausar' }));

    await waitFor(() =>
      expect(useToastStore.getState().toasts).toEqual([
        expect.objectContaining({
          tone: 'error',
          message: '1 de 2 pausados. Não foi possível atualizar. Tente de novo.',
        }),
      ]),
    );
    // The selection stays so the still-active row can be retried without
    // re-picking it from the table.
    expect(screen.getByRole('checkbox', { name: 'Selecionar UTI' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Selecionar Pronto-Socorro' })).toBeChecked();
  });

  it("filters the table by the responsible manager's name, accent-insensitively", async () => {
    vi.spyOn(container.listSectorsUseCase, 'execute').mockResolvedValue([
      { id: 'sector-1', name: 'UTI', isActive: true, managerId: 'manager-1', managerName: 'João', inviteCode: null },
      { id: 'sector-2', name: 'Pronto-Socorro', isActive: true, managerId: 'manager-2', managerName: 'Beatriz', inviteCode: null },
    ]);
    vi.spyOn(container.listManagersUseCase, 'execute').mockResolvedValue([]);
    const user = userEvent.setup();
    renderPage();

    const table = within(await screen.findByRole('table'));
    expect(table.getByText('Pronto-Socorro')).toBeInTheDocument();

    await user.type(screen.getByRole('searchbox'), 'Joao');

    await waitFor(() => expect(table.queryByText('Pronto-Socorro')).not.toBeInTheDocument(), { timeout: 2000 });
    expect(table.getByText('UTI')).toBeInTheDocument();
  });

  it('admits the search only covers loaded items when nothing matches', async () => {
    vi.spyOn(container.listSectorsUseCase, 'execute').mockResolvedValue([
      { id: 'sector-1', name: 'UTI', isActive: true, managerId: null, managerName: null, inviteCode: null },
    ]);
    vi.spyOn(container.listManagersUseCase, 'execute').mockResolvedValue([]);
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('table');
    await user.type(screen.getByRole('searchbox'), 'zzz-no-match');

    expect(await screen.findByText('Nada encontrado para esta busca')).toBeInTheDocument();
    expect(screen.getByText('Tente outro termo ou revise a ortografia.')).toBeInTheDocument();
  });

  it('shows a loading state while the sectors are still fetching, instead of claiming none exist', async () => {
    vi.spyOn(container.listManagersUseCase, 'execute').mockResolvedValue([]);
    vi.spyOn(container.listSectorsUseCase, 'execute').mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(await screen.findByText('Carregando setores…')).toBeInTheDocument();
    expect(screen.queryByText('Nenhum setor cadastrado.')).not.toBeInTheDocument();
  });

  it('shows a retry affordance when the sectors fail to load, instead of claiming none exist', async () => {
    vi.spyOn(container.listManagersUseCase, 'execute').mockResolvedValue([]);
    const listSpy = vi
      .spyOn(container.listSectorsUseCase, 'execute')
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce([{ id: 'sector-1', name: 'UTI', isActive: true, managerId: null, managerName: null, inviteCode: null }]);
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar os setores.');
    expect(screen.queryByText('Nenhum setor cadastrado.')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    await waitFor(() => expect(listSpy).toHaveBeenCalledTimes(2));
    expect(within(await screen.findByRole('table')).getByText('UTI')).toBeInTheDocument();
  });

  describe("hotkeys", () => {
    it("opens the create modal on 'a'", async () => {
      vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([]);
      vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([]);
      renderPage();
      await screen.findByRole("button", { name: "+ Adicionar setor" });

      fireEvent.keyDown(document, { key: "a" });

      expect(await screen.findByRole("dialog", { name: "Adicionar setor" })).toBeInTheDocument();
    });

    it("opens the edit modal on 'e' once exactly one row is selected", async () => {
      vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([
        { id: "1", name: "UTI", isActive: true, managerId: null, managerName: null, inviteCode: null },
      ]);
      vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([]);
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByRole("checkbox", { name: "Selecionar UTI" }));

      fireEvent.keyDown(document, { key: "e" });

      expect(await screen.findByRole("dialog", { name: "Editar UTI" })).toBeInTheDocument();
    });

    it("saves the edit on 'v' while the edit modal is open", async () => {
      vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([
        { id: "1", name: "UTI", isActive: true, managerId: null, managerName: null, inviteCode: null },
      ]);
      vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([
        { id: "manager-1", name: "Paulo", email: "paulo@zelo-demo.local", role: "SECTOR_MANAGER", sectorIds: [], sectorNames: [], isActive: true, hasPassword: true, setPasswordTokenExpiresAt: null },
      ]);
      const updateSector = vi.spyOn(container.updateSectorUseCase, "execute").mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderPage();
      const table = await screen.findByRole("table");
      await user.click(within(table).getByRole("button", { name: "Editar UTI" }));
      const dialog = within(await screen.findByRole("dialog", { name: "Editar UTI" }));
      await user.selectOptions(dialog.getByLabelText("Gestor responsável"), "Paulo");
      dialog.getByRole("button", { name: "Salvar" }).focus();

      fireEvent.keyDown(document, { key: "v" });

      await waitFor(() =>
        expect(updateSector).toHaveBeenCalledWith("token", "1", { managerId: "manager-1" }),
      );
    });

    it("pauses the selection on 'u'", async () => {
      vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([
        { id: "1", name: "UTI", isActive: true, managerId: null, managerName: null, inviteCode: null },
      ]);
      vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([]);
      const updateSector = vi.spyOn(container.updateSectorUseCase, "execute").mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByRole("checkbox", { name: "Selecionar UTI" }));

      fireEvent.keyDown(document, { key: "u" });

      await waitFor(() =>
        expect(updateSector).toHaveBeenCalledWith("token", "1", { isActive: false }),
      );
    });

    it("activates the selection on 'i'", async () => {
      vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([
        { id: "1", name: "UTI", isActive: false, managerId: null, managerName: null, inviteCode: null },
      ]);
      vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([]);
      const updateSector = vi.spyOn(container.updateSectorUseCase, "execute").mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByRole("checkbox", { name: "Selecionar UTI" }));

      fireEvent.keyDown(document, { key: "i" });

      await waitFor(() =>
        expect(updateSector).toHaveBeenCalledWith("token", "1", { isActive: true }),
      );
    });

    it("opens the delete-confirmation modal on 'x', without deleting directly", async () => {
      vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([
        { id: "1", name: "UTI", isActive: true, managerId: null, managerName: null, inviteCode: null },
      ]);
      vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([]);
      const deleteSector = vi.spyOn(container.deleteSectorAdminUseCase, "execute");
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByRole("checkbox", { name: "Selecionar UTI" }));

      fireEvent.keyDown(document, { key: "x" });

      expect(await screen.findByRole("dialog", { name: "Excluir UTI?" })).toBeInTheDocument();
      expect(deleteSector).not.toHaveBeenCalled();
    });

    it("does nothing on 'u' while the create modal sits on top", async () => {
      vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([
        { id: "1", name: "UTI", isActive: true, managerId: null, managerName: null, inviteCode: null },
      ]);
      vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([]);
      const updateSector = vi.spyOn(container.updateSectorUseCase, "execute");
      const user = userEvent.setup();
      renderPage();
      await user.click(await screen.findByRole("checkbox", { name: "Selecionar UTI" }));
      await user.click(screen.getByRole("button", { name: "+ Adicionar setor" }));
      await screen.findByRole("dialog", { name: "Adicionar setor" });

      fireEvent.keyDown(document, { key: "u" });

      expect(updateSector).not.toHaveBeenCalled();
    });
  });
});
