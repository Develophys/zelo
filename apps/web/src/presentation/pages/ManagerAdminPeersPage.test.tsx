import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ManagerAdminPeersPage } from "./ManagerAdminPeersPage";
import * as container from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";
import { AdminDeleteConflictError } from "@/ports/manager-admin.port";

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/manager/admin/peers"]}>
        <Routes>
          <Route path="/manager/admin/peers" element={<ManagerAdminPeersPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ManagerAdminPeersPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
    useManagerSessionStore.getState().setSession("token", new Date(Date.now() + 60_000).toISOString(), "HOSPITAL_ADMIN");
  });

  it("creates a peer partner", async () => {
    vi.spyOn(container.listPeerPartnersUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.createPeerPartnerUseCase, "execute").mockResolvedValue({
      peerPartner: { id: "peer-1", name: "Dra. Ana", email: "ana@zelo-demo.local" },
    });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole("button", { name: "+ Adicionar par" }));
    await user.type(screen.getByLabelText("Nome do par"), "Dra. Ana");
    await user.type(screen.getByLabelText("Email do par"), "ana@zelo-demo.local");
    await user.type(screen.getByLabelText("Especialidade"), "Clínica médica");
    await user.click(screen.getByRole("button", { name: "Adicionar par" }));

    await waitFor(() =>
      expect(container.createPeerPartnerUseCase.execute).toHaveBeenCalledWith("token", {
        name: "Dra. Ana",
        email: "ana@zelo-demo.local",
        specialty: "Clínica médica",
      }),
    );
    await waitFor(() => expect(screen.getByText("Convite enviado para ana@zelo-demo.local.")).toBeInTheDocument());
  });

  it("resends a set-password email for an active peer partner", async () => {
    vi.spyOn(container.listPeerPartnersUseCase, "execute").mockResolvedValue([
      { id: "peer-5", name: "Dr. Paulo", email: "paulo@zelo-demo.local", specialty: "Clínica médica", isActive: true, hasPassword: true, setPasswordTokenExpiresAt: null },
    ]);
    vi.spyOn(container.sendPeerPartnerSetPasswordEmailUseCase, "execute").mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    // Row actions and status pills render once in the desktop table and once
    // in the mobile card list — both are always in the DOM, only CSS decides
    // which shows — so queries for them are scoped to the table.
    const table = within(await screen.findByRole("table"));
    expect(table.getByText("Ativa")).toBeInTheDocument();
    await user.click(table.getByRole("button", { name: "Redefinir senha de Dr. Paulo" }));

    await waitFor(() => expect(container.sendPeerPartnerSetPasswordEmailUseCase.execute).toHaveBeenCalledWith("token", "peer-5"));
    await waitFor(() => expect(screen.getByText("Convite enviado para paulo@zelo-demo.local.")).toBeInTheDocument());
  });

  it('renders the page header with its normative intro', async () => {
    vi.spyOn(container.listPeerPartnersUseCase, 'execute').mockResolvedValue([]);
    renderPage();

    expect(await screen.findByRole('heading', { level: 1, name: 'Pares anônimos' })).toBeInTheDocument();
    expect(
      screen.getByText(
        'Profissionais disponíveis para acolhimento entre pares. A identidade de quem procura acolhimento nunca é revelada.',
      ),
    ).toBeInTheDocument();
  });

  it('pluralises the bulk-action tooltip correctly for this noun', async () => {
    vi.spyOn(container.listPeerPartnersUseCase, 'execute').mockResolvedValue([
      { id: 'p1', name: 'Dra. Ana', email: 'ana@zelo-demo.local', specialty: 'Clínica médica', isActive: true, hasPassword: true, setPasswordTokenExpiresAt: null },
      { id: 'p2', name: 'Dr. Bruno', email: 'bruno@zelo-demo.local', specialty: 'Cirurgia', isActive: false, hasPassword: true, setPasswordTokenExpiresAt: null },
    ]);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('checkbox', { name: 'Selecionar Dra. Ana' }));
    await user.click(screen.getByRole('checkbox', { name: 'Selecionar Dr. Bruno' }));

    const pause = screen.getByRole('button', { name: 'Pausar' });
    fireEvent.focus(pause);
    expect(screen.getByTestId('tooltip')).toHaveTextContent('Selecione apenas pares com o mesmo status');
  });

  it('shows the status vocabulary, not the old account-status text', async () => {
    vi.spyOn(container.listPeerPartnersUseCase, 'execute').mockResolvedValue([
      { id: 'p1', name: 'Dra. Ana', email: 'ana@zelo-demo.local', specialty: 'Clínica médica', isActive: true, hasPassword: true, setPasswordTokenExpiresAt: null },
    ]);
    renderPage();

    // The pill renders once in the desktop table and once in the mobile card
    // list — both are always in the DOM, only CSS decides which shows — so
    // the query is scoped to the table.
    expect(within(await screen.findByRole('table')).getByText('Ativa')).toBeInTheDocument();
    expect(screen.queryByText(/Senha definida/)).not.toBeInTheDocument();
  });

  it('keeps a disabled bulk action focusable so its tooltip is reachable by keyboard', async () => {
    vi.spyOn(container.listPeerPartnersUseCase, 'execute').mockResolvedValue([
      { id: 'p1', name: 'Ana', email: 'ana@zelo-demo.local', specialty: 'Clínica médica', isActive: true, hasPassword: true, setPasswordTokenExpiresAt: null },
      { id: 'p2', name: 'Bruno', email: 'bruno@zelo-demo.local', specialty: 'Cirurgia', isActive: true, hasPassword: true, setPasswordTokenExpiresAt: null },
    ]);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('checkbox', { name: 'Selecionar Ana' }));
    await user.click(screen.getByRole('checkbox', { name: 'Selecionar Bruno' }));

    const edit = screen.getByRole('button', { name: 'Editar' });
    expect(edit).toHaveAttribute('aria-disabled', 'true');
    expect(edit).not.toBeDisabled();
    fireEvent.focus(edit);
    expect(screen.getByTestId('tooltip')).toHaveTextContent('Selecione apenas um par para editar');
  });

  it('deletes the selected peer partners and closes the dialog on the happy path', async () => {
    vi.spyOn(container.listPeerPartnersUseCase, 'execute').mockResolvedValue([
      { id: 'p1', name: 'Ana', email: 'ana@zelo-demo.local', specialty: 'Clínica médica', isActive: true, hasPassword: true, setPasswordTokenExpiresAt: null },
      { id: 'p2', name: 'Bruno', email: 'bruno@zelo-demo.local', specialty: 'Cirurgia', isActive: true, hasPassword: true, setPasswordTokenExpiresAt: null },
    ]);
    const deleteSpy = vi.spyOn(container.deletePeerPartnerAdminUseCase, 'execute').mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('checkbox', { name: 'Selecionar Ana' }));
    await user.click(screen.getByRole('checkbox', { name: 'Selecionar Bruno' }));
    await user.click(screen.getByRole('button', { name: 'Excluir' }));

    const dialog = within(await screen.findByRole('dialog', { name: 'Excluir 2 pares?' }));
    await user.click(dialog.getByRole('button', { name: 'Excluir' }));

    await waitFor(() => expect(deleteSpy).toHaveBeenCalledTimes(2));
    expect(deleteSpy).toHaveBeenNthCalledWith(1, 'token', 'p1');
    expect(deleteSpy).toHaveBeenNthCalledWith(2, 'token', 'p2');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('keeps the delete dialog open and renders the refusal sentence when the API refuses', async () => {
    vi.spyOn(container.listPeerPartnersUseCase, 'execute').mockResolvedValue([
      { id: 'p1', name: 'Ana', email: 'ana@zelo-demo.local', specialty: 'Clínica médica', isActive: true, hasPassword: true, setPasswordTokenExpiresAt: null },
    ]);
    vi.spyOn(container.deletePeerPartnerAdminUseCase, 'execute').mockRejectedValue(
      new AdminDeleteConflictError('UNKNOWN'),
    );
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('checkbox', { name: 'Selecionar Ana' }));
    await user.click(screen.getByRole('button', { name: 'Excluir' }));

    const dialog = within(await screen.findByRole('dialog', { name: 'Excluir par?' }));
    await user.click(dialog.getByRole('button', { name: 'Excluir' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível excluir. Tente de novo.');
    // The refusal is read where it happened, not closed away.
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('reports a partial bulk delete and retries only the still-failing id', async () => {
    vi.spyOn(container.listPeerPartnersUseCase, 'execute').mockResolvedValue([
      { id: 'p1', name: 'Ana', email: 'ana@zelo-demo.local', specialty: 'Clínica médica', isActive: true, hasPassword: true, setPasswordTokenExpiresAt: null },
      { id: 'p2', name: 'Bruno', email: 'bruno@zelo-demo.local', specialty: 'Cirurgia', isActive: true, hasPassword: true, setPasswordTokenExpiresAt: null },
    ]);
    const deleteSpy = vi
      .spyOn(container.deletePeerPartnerAdminUseCase, 'execute')
      .mockImplementation(async (_token: string, id: string) => {
        if (id === 'p2') throw new AdminDeleteConflictError('UNKNOWN');
      });
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('checkbox', { name: 'Selecionar Ana' }));
    await user.click(screen.getByRole('checkbox', { name: 'Selecionar Bruno' }));
    await user.click(screen.getByRole('button', { name: 'Excluir' }));

    await screen.findByRole('dialog', { name: 'Excluir 2 pares?' });
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Excluir' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('1 de 2 excluídos. Não foi possível excluir. Tente de novo.');
    // The dialog narrows to just the still-failing peer partner, so a retry
    // doesn't re-attempt the one that already succeeded.
    expect(screen.getByRole('dialog', { name: 'Excluir par?' })).toBeInTheDocument();

    deleteSpy.mockClear();
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Excluir' }));

    await waitFor(() => expect(deleteSpy).toHaveBeenCalledTimes(1));
    expect(deleteSpy).toHaveBeenCalledWith('token', 'p2');
  });

  it('filters the table by name, accent-insensitively', async () => {
    vi.spyOn(container.listPeerPartnersUseCase, 'execute').mockResolvedValue([
      { id: 'p1', name: 'João', email: 'joao@zelo-demo.local', specialty: 'Clínica médica', isActive: true, hasPassword: true, setPasswordTokenExpiresAt: null },
      { id: 'p2', name: 'Beatriz', email: 'beatriz@zelo-demo.local', specialty: 'Cirurgia', isActive: true, hasPassword: true, setPasswordTokenExpiresAt: null },
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
    vi.spyOn(container.listPeerPartnersUseCase, 'execute').mockResolvedValue([
      { id: 'p1', name: 'Ana', email: 'ana@zelo-demo.local', specialty: 'Clínica médica', isActive: true, hasPassword: true, setPasswordTokenExpiresAt: null },
    ]);
    const user = userEvent.setup();
    renderPage();

    await screen.findByRole('table');
    await user.type(screen.getByRole('searchbox'), 'zzz-no-match');

    expect(await screen.findByText('Nenhum resultado nos itens carregados')).toBeInTheDocument();
    expect(screen.getByText('A busca ainda percorre apenas a lista já carregada.')).toBeInTheDocument();
  });
});
