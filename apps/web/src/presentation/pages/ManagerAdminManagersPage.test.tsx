import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ManagerAdminManagersPage } from "./ManagerAdminManagersPage";
import * as container from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";
import { AdminDeleteConflictError } from "@/ports/manager-admin.port";

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/manager/admin/managers"]}>
        <Routes>
          <Route path="/manager/admin/managers" element={<ManagerAdminManagersPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ManagerAdminManagersPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
    useManagerSessionStore.getState().setSession("token", new Date(Date.now() + 60_000).toISOString(), "HOSPITAL_ADMIN");
  });

  it("creates a SECTOR_MANAGER with the selected sectors", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([
      { id: "sector-1", name: "UTI", isActive: true, managerId: null, managerName: null },
    ]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.createManagerAdminUseCase, "execute").mockResolvedValue({
      manager: { id: "manager-2", name: "Paulo", email: "paulo@zelo-demo.local" },
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "+ Adicionar gestor" }));
    await user.type(await screen.findByLabelText("Nome do gestor"), "Paulo");
    await user.type(screen.getByLabelText("Email do gestor"), "paulo@zelo-demo.local");
    await user.click(screen.getByLabelText("Gestor de setor"));
    await user.click(await screen.findByRole("button", { name: "UTI" }));
    await user.click(screen.getByRole("button", { name: "Adicionar gestor" }));

    await waitFor(() =>
      expect(container.createManagerAdminUseCase.execute).toHaveBeenCalledWith("token", {
        name: "Paulo",
        email: "paulo@zelo-demo.local",
        role: "SECTOR_MANAGER",
        sectorIds: ["sector-1"],
      }),
    );
    await waitFor(() => expect(screen.getByText("Convite enviado para paulo@zelo-demo.local.")).toBeInTheDocument());
  });

  it("creates a HOSPITAL_ADMIN by default, without a role change", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.createManagerAdminUseCase, "execute").mockResolvedValue({
      manager: { id: "manager-3", name: "Ana", email: "ana@zelo-demo.local" },
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "+ Adicionar gestor" }));
    await user.type(await screen.findByLabelText("Nome do gestor"), "Ana");
    await user.type(screen.getByLabelText("Email do gestor"), "ana@zelo-demo.local");
    await user.click(screen.getByRole("button", { name: "Adicionar gestor" }));

    await waitFor(() =>
      expect(container.createManagerAdminUseCase.execute).toHaveBeenCalledWith("token", {
        name: "Ana",
        email: "ana@zelo-demo.local",
        role: "HOSPITAL_ADMIN",
        sectorIds: undefined,
      }),
    );
  });

  it("shows account status as a pill and lets an admin resend a set-password email for an active manager", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([
      { id: "manager-5", name: "Paulo", email: "paulo@zelo-demo.local", role: "SECTOR_MANAGER", isActive: true, sectorNames: ["UTI"], hasPassword: true, setPasswordTokenExpiresAt: null },
    ]);
    vi.spyOn(container.sendManagerSetPasswordEmailUseCase, "execute").mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    // Row actions and status pills render once in the desktop table and once
    // in the mobile card list — both are always in the DOM, only CSS decides
    // which shows — so queries for them are scoped to the table.
    const table = within(await screen.findByRole("table"));
    expect(table.getByText("Ativa")).toBeInTheDocument();
    await user.click(table.getByRole("button", { name: "Redefinir senha de Paulo" }));

    await waitFor(() => expect(container.sendManagerSetPasswordEmailUseCase.execute).toHaveBeenCalledWith("token", "manager-5"));
    await waitFor(() => expect(screen.getByText("Convite enviado para paulo@zelo-demo.local.")).toBeInTheDocument());
  });

  it("shows a pending-invite status and a reenviar-convite button for a manager with no password yet", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([
      { id: "manager-6", name: "Renata", email: "renata@zelo-demo.local", role: "SECTOR_MANAGER", isActive: true, sectorNames: [], hasPassword: false, setPasswordTokenExpiresAt: new Date(Date.now() + 60_000).toISOString() },
    ]);
    vi.spyOn(container.sendManagerSetPasswordEmailUseCase, "execute").mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    const table = within(await screen.findByRole("table"));
    expect(table.getByText("Convite pendente")).toBeInTheDocument();
    await user.click(table.getByRole("button", { name: "Reenviar convite de Renata" }));

    await waitFor(() => expect(container.sendManagerSetPasswordEmailUseCase.execute).toHaveBeenCalledWith("token", "manager-6"));
  });

  it("edits an existing manager's role and sectors from the edit modal, pre-filled from their current assignment", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([
      { id: "sector-1", name: "UTI", isActive: true, managerId: null, managerName: null },
      { id: "sector-2", name: "Pronto-Socorro", isActive: true, managerId: null, managerName: null },
    ]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([
      { id: "manager-5", name: "Paulo", email: "paulo@zelo-demo.local", role: "SECTOR_MANAGER", isActive: true, sectorNames: ["UTI"], hasPassword: true, setPasswordTokenExpiresAt: null },
    ]);
    vi.spyOn(container.updateManagerAdminUseCase, "execute").mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.click(within(await screen.findByRole("table")).getByRole("button", { name: "Editar Paulo" }));

    const editForm = within(screen.getByRole("dialog"));
    expect(editForm.getByLabelText("Gestor de setor")).toBeChecked();
    expect(editForm.getByRole("button", { name: "UTI" })).toHaveAttribute("aria-pressed", "true");
    expect(editForm.getByRole("button", { name: "Pronto-Socorro" })).toHaveAttribute("aria-pressed", "false");

    await user.click(editForm.getByRole("button", { name: "Pronto-Socorro" }));
    await user.click(editForm.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(container.updateManagerAdminUseCase.execute).toHaveBeenCalledWith("token", "manager-5", {
        role: "SECTOR_MANAGER",
        sectorIds: ["sector-1", "sector-2"],
      }),
    );
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("promotes an existing manager to hospital admin from the edit modal", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([
      { id: "sector-1", name: "UTI", isActive: true, managerId: null, managerName: null },
    ]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([
      { id: "manager-5", name: "Paulo", email: "paulo@zelo-demo.local", role: "SECTOR_MANAGER", isActive: true, sectorNames: ["UTI"], hasPassword: true, setPasswordTokenExpiresAt: null },
    ]);
    vi.spyOn(container.updateManagerAdminUseCase, "execute").mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.click(within(await screen.findByRole("table")).getByRole("button", { name: "Editar Paulo" }));

    const editForm = within(screen.getByRole("dialog"));
    await user.click(editForm.getByLabelText("Gestor do hospital"));
    await user.click(editForm.getByRole("button", { name: "Salvar" }));

    await waitFor(() =>
      expect(container.updateManagerAdminUseCase.execute).toHaveBeenCalledWith("token", "manager-5", {
        role: "HOSPITAL_ADMIN",
        sectorIds: undefined,
      }),
    );
  });

  it("discards edits on Cancelar without calling the update mutation", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([
      { id: "sector-1", name: "UTI", isActive: true, managerId: null, managerName: null },
    ]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([
      { id: "manager-5", name: "Paulo", email: "paulo@zelo-demo.local", role: "SECTOR_MANAGER", isActive: true, sectorNames: ["UTI"], hasPassword: true, setPasswordTokenExpiresAt: null },
    ]);
    const updateSpy = vi.spyOn(container.updateManagerAdminUseCase, "execute").mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.click(within(await screen.findByRole("table")).getByRole("button", { name: "Editar Paulo" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Cancelar" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(updateSpy).not.toHaveBeenCalled();
  });

  it('renders the page header with its normative intro', async () => {
    vi.spyOn(container.listSectorsUseCase, 'execute').mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, 'execute').mockResolvedValue([]);
    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'Gestores' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Quem tem acesso ao painel e a quais setores. Cadastre um gestor antes de vinculá-lo a um setor.',
      ),
    ).toBeInTheDocument();
  });

  it('shows status as a pill in the panel vocabulary, not "Senha definida"', async () => {
    vi.spyOn(container.listSectorsUseCase, 'execute').mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, 'execute').mockResolvedValue([
      { id: 'm1', name: 'Ana', email: 'ana@zelo-demo.local', role: 'HOSPITAL_ADMIN', isActive: true, sectorNames: [], hasPassword: true, setPasswordTokenExpiresAt: null },
    ]);
    renderPage();

    expect(within(await screen.findByRole('table')).getByText('Ativa')).toBeInTheDocument();
    expect(screen.queryByText(/Senha definida/)).not.toBeInTheDocument();
  });

  it('offers Reenviar convite only for an invite that has not been accepted', async () => {
    vi.spyOn(container.listSectorsUseCase, 'execute').mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, 'execute').mockResolvedValue([
      { id: 'm1', name: 'Ana', email: 'ana@zelo-demo.local', role: 'HOSPITAL_ADMIN', isActive: true, sectorNames: [], hasPassword: true, setPasswordTokenExpiresAt: null },
      { id: 'm2', name: 'Bruno', email: 'bruno@zelo-demo.local', role: 'HOSPITAL_ADMIN', isActive: true, sectorNames: [], hasPassword: false, setPasswordTokenExpiresAt: new Date(Date.now() + 60_000).toISOString() },
    ]);
    renderPage();

    const table = within(await screen.findByRole('table'));
    expect(table.getByRole('button', { name: 'Reenviar convite de Bruno' })).toBeInTheDocument();
    expect(table.queryByRole('button', { name: 'Reenviar convite de Ana' })).not.toBeInTheDocument();
  });

  // The header row must not move when the selection appears, or the manager
  // loses their place in the list.
  it('does not shift the table when a row is selected', async () => {
    vi.spyOn(container.listSectorsUseCase, 'execute').mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, 'execute').mockResolvedValue([
      { id: 'm1', name: 'Ana', email: 'ana@zelo-demo.local', role: 'HOSPITAL_ADMIN', isActive: true, sectorNames: [], hasPassword: true, setPasswordTokenExpiresAt: null },
    ]);
    const user = userEvent.setup();
    renderPage();

    // The select-all checkbox is present from the very first render (the
    // toolbar doesn't gate on load), so wait on the row checkbox instead —
    // it only exists once the manager has actually loaded.
    await screen.findByRole('checkbox', { name: 'Selecionar Ana' });
    const toolbar = screen.getByRole('checkbox', { name: 'Selecionar todos' }).closest('div')!;
    const before = toolbar.className;
    await user.click(screen.getByRole('checkbox', { name: 'Selecionar Ana' }));
    expect(toolbar.className).toBe(before);
    expect(toolbar.className).toContain('h-14');
  });

  it('keeps a disabled bulk action focusable so its tooltip is reachable by keyboard', async () => {
    vi.spyOn(container.listSectorsUseCase, 'execute').mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, 'execute').mockResolvedValue([
      { id: 'm1', name: 'Ana', email: 'ana@zelo-demo.local', role: 'HOSPITAL_ADMIN', isActive: true, sectorNames: [], hasPassword: true, setPasswordTokenExpiresAt: null },
      { id: 'm2', name: 'Bruno', email: 'bruno@zelo-demo.local', role: 'HOSPITAL_ADMIN', isActive: true, sectorNames: [], hasPassword: true, setPasswordTokenExpiresAt: null },
    ]);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('checkbox', { name: 'Selecionar Ana' }));
    await user.click(screen.getByRole('checkbox', { name: 'Selecionar Bruno' }));

    const edit = screen.getByRole('button', { name: 'Editar' });
    expect(edit).toHaveAttribute('aria-disabled', 'true');
    expect(edit).not.toBeDisabled();
    fireEvent.focus(edit);
    expect(screen.getByTestId('tooltip')).toHaveTextContent('Selecione apenas um gestor para editar');
  });

  it('opens the create form as a modal instead of an inline form', async () => {
    vi.spyOn(container.listSectorsUseCase, 'execute').mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, 'execute').mockResolvedValue([]);
    const user = userEvent.setup();
    renderPage();

    expect(screen.queryByLabelText('Nome do gestor')).not.toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: '+ Adicionar gestor' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByLabelText('Nome do gestor')).toBeInTheDocument();
  });

  it('points at Setores when a sector manager has no sector to pick', async () => {
    vi.spyOn(container.listSectorsUseCase, 'execute').mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, 'execute').mockResolvedValue([]);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: '+ Adicionar gestor' }));
    await user.click(screen.getByLabelText('Gestor de setor'));
    expect(screen.getByRole('link', { name: 'Cadastrar um setor' })).toHaveAttribute(
      'href',
      '/manager/admin/sectors',
    );
  });

  it('renders cards instead of a table below md, with the card itself as the selection target', async () => {
    vi.spyOn(container.listSectorsUseCase, 'execute').mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, 'execute').mockResolvedValue([
      { id: 'm1', name: 'Ana', email: 'ana@zelo-demo.local', role: 'HOSPITAL_ADMIN', isActive: true, sectorNames: [], hasPassword: true, setPasswordTokenExpiresAt: null },
    ]);
    renderPage();

    const cards = screen.getByTestId('manager-card-list');
    expect(cards.className).toContain('md:hidden');
    // The whole card selects — there is no checkbox inside it. The list
    // itself is always in the DOM (only CSS hides it above md), so wait on
    // its content rather than the container. Queried by its full accessible
    // name (not a loose /Ana/ regex) because the card also carries row-action
    // buttons named "... de Ana", which a loose match would multi-hit.
    const card = await within(cards).findByRole('button', { name: 'Ana, Ativa' });
    expect(within(card).queryByRole('checkbox')).not.toBeInTheDocument();
  });

  it('exposes row actions as siblings of the selection button in the mobile card list, gated the same way as the table', async () => {
    vi.spyOn(container.listSectorsUseCase, 'execute').mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, 'execute').mockResolvedValue([
      { id: 'm1', name: 'Ana', email: 'ana@zelo-demo.local', role: 'HOSPITAL_ADMIN', isActive: true, sectorNames: [], hasPassword: true, setPasswordTokenExpiresAt: null },
      { id: 'm2', name: 'Bruno', email: 'bruno@zelo-demo.local', role: 'HOSPITAL_ADMIN', isActive: true, sectorNames: [], hasPassword: false, setPasswordTokenExpiresAt: new Date(Date.now() + 60_000).toISOString() },
    ]);
    renderPage();

    const cards = screen.getByTestId('manager-card-list');
    await within(cards).findByRole('button', { name: 'Ana, Ativa' });

    // A card is a <button> nowhere nested inside another <button> — the
    // selection button and the action IconButtons are siblings under the <li>.
    expect(within(cards).getByRole('button', { name: 'Editar Ana' })).toBeInTheDocument();
    expect(within(cards).getByRole('button', { name: 'Redefinir senha de Ana' })).toBeInTheDocument();
    expect(within(cards).queryByRole('button', { name: 'Reenviar convite de Ana' })).not.toBeInTheDocument();

    expect(within(cards).getByRole('button', { name: 'Editar Bruno' })).toBeInTheDocument();
    expect(within(cards).getByRole('button', { name: 'Reenviar convite de Bruno' })).toBeInTheDocument();
    expect(within(cards).queryByRole('button', { name: 'Redefinir senha de Bruno' })).not.toBeInTheDocument();
  });

  it('deletes the selected managers and closes the dialog on the happy path', async () => {
    vi.spyOn(container.listSectorsUseCase, 'execute').mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, 'execute').mockResolvedValue([
      { id: 'm1', name: 'Ana', email: 'ana@zelo-demo.local', role: 'HOSPITAL_ADMIN', isActive: true, sectorNames: [], hasPassword: true, setPasswordTokenExpiresAt: null },
      { id: 'm2', name: 'Bruno', email: 'bruno@zelo-demo.local', role: 'HOSPITAL_ADMIN', isActive: true, sectorNames: [], hasPassword: true, setPasswordTokenExpiresAt: null },
    ]);
    const deleteSpy = vi.spyOn(container.deleteManagerAdminUseCase, 'execute').mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('checkbox', { name: 'Selecionar Ana' }));
    await user.click(screen.getByRole('checkbox', { name: 'Selecionar Bruno' }));
    await user.click(screen.getByRole('button', { name: 'Excluir' }));

    const dialog = within(await screen.findByRole('dialog', { name: 'Excluir 2 gestores?' }));
    await user.click(dialog.getByRole('button', { name: 'Excluir' }));

    await waitFor(() => expect(deleteSpy).toHaveBeenCalledTimes(2));
    expect(deleteSpy).toHaveBeenNthCalledWith(1, 'token', 'm1');
    expect(deleteSpy).toHaveBeenNthCalledWith(2, 'token', 'm2');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('keeps the delete dialog open and renders the refusal sentence when the API refuses', async () => {
    vi.spyOn(container.listSectorsUseCase, 'execute').mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, 'execute').mockResolvedValue([
      { id: 'm1', name: 'Ana', email: 'ana@zelo-demo.local', role: 'HOSPITAL_ADMIN', isActive: true, sectorNames: [], hasPassword: true, setPasswordTokenExpiresAt: null },
    ]);
    vi.spyOn(container.deleteManagerAdminUseCase, 'execute').mockRejectedValue(
      new AdminDeleteConflictError('MANAGER_OWNS_SECTORS'),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('checkbox', { name: 'Selecionar Ana' }));
    await user.click(screen.getByRole('button', { name: 'Excluir' }));

    const dialog = within(await screen.findByRole('dialog', { name: 'Excluir gestor?' }));
    await user.click(dialog.getByRole('button', { name: 'Excluir' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Este gestor ainda é responsável por setores. Reatribua os setores antes de excluí-lo.',
    );
    // The refusal is read where it happened, not closed away.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('reports a partial bulk delete and retries only the still-failing id', async () => {
    vi.spyOn(container.listSectorsUseCase, 'execute').mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, 'execute').mockResolvedValue([
      { id: 'm1', name: 'Ana', email: 'ana@zelo-demo.local', role: 'HOSPITAL_ADMIN', isActive: true, sectorNames: [], hasPassword: true, setPasswordTokenExpiresAt: null },
      { id: 'm2', name: 'Bruno', email: 'bruno@zelo-demo.local', role: 'HOSPITAL_ADMIN', isActive: true, sectorNames: [], hasPassword: true, setPasswordTokenExpiresAt: null },
    ]);
    const deleteSpy = vi
      .spyOn(container.deleteManagerAdminUseCase, 'execute')
      .mockImplementation(async (_token: string, id: string) => {
        if (id === 'm2') throw new AdminDeleteConflictError('MANAGER_OWNS_SECTORS');
      });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('checkbox', { name: 'Selecionar Ana' }));
    await user.click(screen.getByRole('checkbox', { name: 'Selecionar Bruno' }));
    await user.click(screen.getByRole('button', { name: 'Excluir' }));

    await screen.findByRole('dialog', { name: 'Excluir 2 gestores?' });
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Excluir' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      '1 de 2 excluídos. Este gestor ainda é responsável por setores. Reatribua os setores antes de excluí-lo.',
    );
    // The dialog narrows to just the still-failing manager, so a retry
    // doesn't re-attempt the one that already succeeded.
    expect(screen.getByRole('dialog', { name: 'Excluir gestor?' })).toBeInTheDocument();

    deleteSpy.mockClear();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Excluir' }));

    await waitFor(() => expect(deleteSpy).toHaveBeenCalledTimes(1));
    expect(deleteSpy).toHaveBeenCalledWith('token', 'm2');
  });

  it('filters the table by name, accent-insensitively', async () => {
    vi.spyOn(container.listSectorsUseCase, 'execute').mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, 'execute').mockResolvedValue([
      { id: 'm1', name: 'João', email: 'joao@zelo-demo.local', role: 'HOSPITAL_ADMIN', isActive: true, sectorNames: [], hasPassword: true, setPasswordTokenExpiresAt: null },
      { id: 'm2', name: 'Beatriz', email: 'beatriz@zelo-demo.local', role: 'HOSPITAL_ADMIN', isActive: true, sectorNames: [], hasPassword: true, setPasswordTokenExpiresAt: null },
    ]);
    const user = userEvent.setup();
    renderPage();

    const table = within(await screen.findByRole('table'));
    expect(table.getByText('Beatriz')).toBeInTheDocument();

    await user.type(screen.getByRole('searchbox'), 'Joao');

    await waitFor(() => expect(table.queryByText('Beatriz')).not.toBeInTheDocument(), { timeout: 2000 });
    expect(table.getByText('João')).toBeInTheDocument();
  });

  it('admits the search only covers loaded items when nothing matches', async () => {
    vi.spyOn(container.listSectorsUseCase, 'execute').mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, 'execute').mockResolvedValue([
      { id: 'm1', name: 'Ana', email: 'ana@zelo-demo.local', role: 'HOSPITAL_ADMIN', isActive: true, sectorNames: [], hasPassword: true, setPasswordTokenExpiresAt: null },
    ]);
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('table');
    await user.type(screen.getByRole('searchbox'), 'zzz-no-match');

    expect(await screen.findByText('Nenhum resultado nos itens carregados')).toBeInTheDocument();
    expect(screen.getByText('A busca ainda percorre apenas a lista já carregada.')).toBeInTheDocument();
  });

  it('shows a loading state while the managers are still fetching, instead of claiming none exist', async () => {
    vi.spyOn(container.listSectorsUseCase, 'execute').mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, 'execute').mockReturnValue(new Promise(() => {}));
    renderPage();

    expect(await screen.findByText('Carregando gestores…')).toBeInTheDocument();
    expect(screen.queryByText('Nenhum gestor cadastrado.')).not.toBeInTheDocument();
  });

  it('shows a retry affordance when the managers fail to load, instead of claiming none exist', async () => {
    vi.spyOn(container.listSectorsUseCase, 'execute').mockResolvedValue([]);
    const listSpy = vi
      .spyOn(container.listManagersUseCase, 'execute')
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce([
        { id: 'm1', name: 'Ana', email: 'ana@zelo-demo.local', role: 'HOSPITAL_ADMIN', isActive: true, sectorNames: [], hasPassword: true, setPasswordTokenExpiresAt: null },
      ]);
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível carregar os gestores.');
    expect(screen.queryByText('Nenhum gestor cadastrado.')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Tentar de novo' }));

    await waitFor(() => expect(listSpy).toHaveBeenCalledTimes(2));
    expect(within(await screen.findByRole('table')).getByText('Ana')).toBeInTheDocument();
  });
});
