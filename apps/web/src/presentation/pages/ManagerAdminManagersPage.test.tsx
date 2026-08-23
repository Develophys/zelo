import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ManagerAdminManagersPage } from "./ManagerAdminManagersPage";
import * as container from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

function renderPage() {
  const queryClient = new QueryClient();
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

    // The status pill renders once in the desktop table and once in the
    // mobile card list — both are always in the DOM, only CSS decides which
    // shows, so the assertion is scoped to the table.
    expect(within(await screen.findByRole("table")).getByText("Ativa")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Redefinir senha de Paulo" }));

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

    expect(within(await screen.findByRole("table")).getByText("Convite pendente")).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Reenviar convite de Renata" }));

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

    await user.click(await screen.findByRole("button", { name: "Editar Paulo" }));

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

    await user.click(await screen.findByRole("button", { name: "Editar Paulo" }));

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

    await user.click(await screen.findByRole("button", { name: "Editar Paulo" }));
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

    expect(await screen.findByRole('button', { name: 'Reenviar convite de Bruno' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reenviar convite de Ana' })).not.toBeInTheDocument();
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
    // its content rather than the container.
    const card = await within(cards).findByRole('button', { name: /Ana/ });
    expect(within(card).queryByRole('checkbox')).not.toBeInTheDocument();
  });
});
