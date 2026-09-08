import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminInstitutionsPage } from "./AdminInstitutionsPage";
import * as container from "@/app/container";
import { useAdminSessionStore } from "@/stores/admin-session.store";
import { routes } from "@/presentation/lib/routes";
import { DuplicateInstitutionError } from "@/ports/admin-institution.port";
import { useToastStore } from "@/stores/toast.store";

const { toCanvasMock } = vi.hoisted(() => ({
  toCanvasMock: vi.fn().mockResolvedValue(undefined),
}));

// jsdom has no 2D canvas context, so the real qrcode library cannot run here
// — every QR-modal test only cares that it was asked to draw the right code.
vi.mock("qrcode", () => ({
  default: { toCanvas: toCanvasMock },
}));

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/admin"]}>
        <Routes>
          <Route path="/admin" element={<AdminInstitutionsPage />} />
          <Route path={routes.home} element={<p>Início do médico</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminInstitutionsPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
    useAdminSessionStore.getState().setSession("token", new Date(Date.now() + 60_000).toISOString());
    useToastStore.getState().clear();
  });

  async function openCreateModal(user: ReturnType<typeof userEvent.setup>) {
    await user.click(await screen.findByRole("button", { name: "+ Adicionar instituição" }));
  }

  it("lists existing institutions", async () => {
    vi.spyOn(container.listInstitutionsUseCase, "execute").mockResolvedValue([
      { id: "1", name: "Hospital Teste", inviteCode: "teste-2026", isActive: true, createdAt: "2026-08-01T00:00:00.000Z", hospitalAdminNames: ["Mauricio"] },
    ]);
    renderPage();

    const table = within(await screen.findByRole("table"));
    expect(table.getByText("Hospital Teste")).toBeInTheDocument();
  });

  it("shows an institution's active/inactive status as a pill", async () => {
    vi.spyOn(container.listInstitutionsUseCase, "execute").mockResolvedValue([
      { id: "1", name: "Hospital Ativo", inviteCode: "ativo-2026", isActive: true, createdAt: "2026-08-01T00:00:00.000Z", hospitalAdminNames: [] },
      { id: "2", name: "Hospital Inativo", inviteCode: "inativo-2026", isActive: false, createdAt: "2026-08-01T00:00:00.000Z", hospitalAdminNames: [] },
    ]);
    renderPage();

    const table = within(await screen.findByRole("table"));
    expect(table.getByText("Ativa")).toBeInTheDocument();
    expect(table.getByText("Inativa")).toBeInTheDocument();
  });

  describe("the institution's QR code", () => {
    beforeEach(() => {
      toCanvasMock.mockClear();
      toCanvasMock.mockResolvedValue(undefined);
    });

    it("renders the invite code as a QR code once opened", async () => {
      vi.spyOn(container.listInstitutionsUseCase, "execute").mockResolvedValue([
        { id: "1", name: "Hospital Teste", inviteCode: "teste-2026", isActive: true, createdAt: "2026-08-01T00:00:00.000Z", hospitalAdminNames: ["Mauricio"] },
      ]);
      const user = userEvent.setup();
      renderPage();

      const table = within(await screen.findByRole("table"));
      await user.click(table.getByRole("button", { name: "Ver QR Code de Hospital Teste" }));

      expect(screen.getByRole("dialog", { name: "QR Code — Hospital Teste" })).toBeInTheDocument();
      await waitFor(() => expect(toCanvasMock).toHaveBeenCalledWith(expect.anything(), "teste-2026", expect.anything()));
    });

    it("enables the download only once the QR code has actually rendered", async () => {
      let resolveDraw!: () => void;
      toCanvasMock.mockReturnValue(
        new Promise<void>((resolve) => {
          resolveDraw = resolve;
        }),
      );
      vi.spyOn(container.listInstitutionsUseCase, "execute").mockResolvedValue([
        { id: "1", name: "Hospital Teste", inviteCode: "teste-2026", isActive: true, createdAt: "2026-08-01T00:00:00.000Z", hospitalAdminNames: ["Mauricio"] },
      ]);
      const user = userEvent.setup();
      renderPage();

      const table = within(await screen.findByRole("table"));
      await user.click(table.getByRole("button", { name: "Ver QR Code de Hospital Teste" }));
      expect(screen.getByRole("button", { name: "Baixar PNG" })).toBeDisabled();

      resolveDraw();
      await waitFor(() => expect(screen.getByRole("button", { name: "Baixar PNG" })).not.toBeDisabled());
    });

    it("downloads the rendered QR code as a PNG named after the invite code", async () => {
      if (!URL.createObjectURL) URL.createObjectURL = vi.fn();
      if (!URL.revokeObjectURL) URL.revokeObjectURL = vi.fn();
      vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:mock-url");
      vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
      const clickSpy = vi.fn();
      let capturedAnchor: HTMLAnchorElement | undefined;
      const originalCreateElement = document.createElement.bind(document);
      vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
        const element = originalCreateElement(tag);
        if (tag === "a") {
          element.click = clickSpy;
          capturedAnchor = element as HTMLAnchorElement;
        }
        return element;
      });
      vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((callback) => {
        callback(new Blob(["fake-png"], { type: "image/png" }));
      });

      vi.spyOn(container.listInstitutionsUseCase, "execute").mockResolvedValue([
        { id: "1", name: "Hospital Teste", inviteCode: "teste-2026", isActive: true, createdAt: "2026-08-01T00:00:00.000Z", hospitalAdminNames: ["Mauricio"] },
      ]);
      const user = userEvent.setup();
      renderPage();

      const table = within(await screen.findByRole("table"));
      await user.click(table.getByRole("button", { name: "Ver QR Code de Hospital Teste" }));
      await waitFor(() => expect(screen.getByRole("button", { name: "Baixar PNG" })).not.toBeDisabled());
      await user.click(screen.getByRole("button", { name: "Baixar PNG" }));

      expect(clickSpy).toHaveBeenCalledOnce();
      expect(capturedAnchor?.download).toBe("zelo-convite-teste-2026.png");
    });
  });

  it("creates an institution via the Adicionar instituição modal, confirming with a toast", async () => {
    vi.spyOn(container.listInstitutionsUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.createInstitutionUseCase, "execute").mockResolvedValue({
      institution: { id: "1", name: "Hospital Teste", inviteCode: "teste-2026" },
      hospitalAdmin: { id: "m1", name: "Mauricio", email: "mauricio@zelo-demo.local" },
    });
    const user = userEvent.setup();
    renderPage();

    await openCreateModal(user);
    const dialog = within(screen.getByRole("dialog", { name: "Adicionar instituição" }));
    await user.type(dialog.getByLabelText("Nome do hospital"), "Hospital Teste");
    await user.type(dialog.getByLabelText("Código de convite"), "teste-2026");
    await user.type(dialog.getByLabelText("Nome do gestor do hospital"), "Mauricio");
    await user.type(dialog.getByLabelText("Email do gestor do hospital"), "mauricio@zelo-demo.local");
    await user.click(dialog.getByRole("button", { name: "Adicionar instituição" }));

    await waitFor(() =>
      expect(useToastStore.getState().toasts).toEqual([
        expect.objectContaining({ tone: "success", message: "Convite enviado para mauricio@zelo-demo.local." }),
      ]),
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("distinguishes a failed load from an empty register", async () => {
    vi.spyOn(container.listInstitutionsUseCase, "execute").mockRejectedValue(new Error("offline"));
    renderPage();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/não foi possível carregar/i);
    expect(screen.queryByText(/Nenhuma instituição/i)).not.toBeInTheDocument();
  });

  it("says the register is empty when it genuinely is", async () => {
    vi.spyOn(container.listInstitutionsUseCase, "execute").mockResolvedValue([]);
    renderPage();

    expect(await screen.findByText(/Nenhuma instituição cadastrada/i)).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("rejects a malformed hospital admin email, keeping the submit button disabled", async () => {
    vi.spyOn(container.listInstitutionsUseCase, "execute").mockResolvedValue([]);
    const createInstitution = vi.spyOn(container.createInstitutionUseCase, "execute");
    const user = userEvent.setup();
    renderPage();

    await openCreateModal(user);
    const dialog = within(screen.getByRole("dialog", { name: "Adicionar instituição" }));
    await user.type(dialog.getByLabelText("Nome do hospital"), "Hospital Teste");
    await user.type(dialog.getByLabelText("Código de convite"), "teste-2026");
    await user.type(dialog.getByLabelText("Nome do gestor do hospital"), "Mauricio");
    const emailField = dialog.getByLabelText("Email do gestor do hospital");
    await user.type(emailField, "not-an-email");
    await user.tab();

    expect(await dialog.findByRole("alert")).toHaveTextContent("Digite um email válido.");
    expect(emailField).toHaveAttribute("aria-invalid", "true");
    expect(dialog.getByRole("button", { name: "Adicionar instituição" })).toBeDisabled();
    expect(createInstitution).not.toHaveBeenCalled();
  });

  it("offers the theme toggle next to Sair", async () => {
    vi.spyOn(container.listInstitutionsUseCase, "execute").mockResolvedValue([]);
    renderPage();

    expect(await screen.findByTestId("theme-switch")).toBeInTheDocument();
  });

  it("sends Sair to the doctor Home, not back to the admin login screen", async () => {
    vi.spyOn(container.listInstitutionsUseCase, "execute").mockResolvedValue([]);
    const user = userEvent.setup();
    renderPage();

    await user.click(screen.getByRole("button", { name: "Sair" }));

    expect(await screen.findByText("Início do médico")).toBeInTheDocument();
  });

  describe("editing and deactivating an institution", () => {
    it("renames the institution", async () => {
      vi.spyOn(container.listInstitutionsUseCase, "execute").mockResolvedValue([
        { id: "1", name: "Hospital Teste", inviteCode: "teste-2026", isActive: true, createdAt: "2026-08-01T00:00:00.000Z", hospitalAdminNames: ["Mauricio"] },
      ]);
      const updateInstitution = vi.spyOn(container.updateInstitutionUseCase, "execute").mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderPage();

      const table = within(await screen.findByRole("table"));
      await user.click(table.getByRole("button", { name: "Editar Hospital Teste" }));

      const dialog = within(screen.getByRole("dialog", { name: "Editar Hospital Teste" }));
      expect(dialog.getByLabelText("Nome do hospital")).toHaveValue("Hospital Teste");
      await user.clear(dialog.getByLabelText("Nome do hospital"));
      await user.type(dialog.getByLabelText("Nome do hospital"), "Hospital Renomeado");
      await user.click(dialog.getByRole("button", { name: "Salvar" }));

      await waitFor(() =>
        expect(updateInstitution).toHaveBeenCalledWith("token", "1", { name: "Hospital Renomeado" }),
      );
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });

    it("shows a conflict message when the new name is already taken, keeping the modal open", async () => {
      vi.spyOn(container.listInstitutionsUseCase, "execute").mockResolvedValue([
        { id: "1", name: "Hospital Teste", inviteCode: "teste-2026", isActive: true, createdAt: "2026-08-01T00:00:00.000Z", hospitalAdminNames: [] },
      ]);
      vi.spyOn(container.updateInstitutionUseCase, "execute").mockRejectedValue(new DuplicateInstitutionError());
      const user = userEvent.setup();
      renderPage();

      const table = within(await screen.findByRole("table"));
      await user.click(table.getByRole("button", { name: "Editar Hospital Teste" }));
      const dialog = within(screen.getByRole("dialog", { name: "Editar Hospital Teste" }));
      await user.clear(dialog.getByLabelText("Nome do hospital"));
      await user.type(dialog.getByLabelText("Nome do hospital"), "Nome Já Usado");
      await user.click(dialog.getByRole("button", { name: "Salvar" }));

      expect(await dialog.findByRole("alert")).toHaveTextContent("Já existe uma instituição com esse nome.");
      expect(screen.getByRole("dialog")).toBeInTheDocument();
    });

    it("deactivates a selected institution through the bulk toolbar action", async () => {
      vi.spyOn(container.listInstitutionsUseCase, "execute").mockResolvedValue([
        { id: "1", name: "Hospital Teste", inviteCode: "teste-2026", isActive: true, createdAt: "2026-08-01T00:00:00.000Z", hospitalAdminNames: [] },
      ]);
      const updateInstitution = vi.spyOn(container.updateInstitutionUseCase, "execute").mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole("checkbox", { name: "Selecionar Hospital Teste" }));
      await user.click(screen.getByRole("button", { name: "Desativar" }));

      await waitFor(() =>
        expect(updateInstitution).toHaveBeenCalledWith("token", "1", { isActive: false }),
      );
    });

    it("reactivates a selected inactive institution through the bulk toolbar action", async () => {
      vi.spyOn(container.listInstitutionsUseCase, "execute").mockResolvedValue([
        { id: "1", name: "Hospital Pausado", inviteCode: "pausado-2026", isActive: false, createdAt: "2026-08-01T00:00:00.000Z", hospitalAdminNames: [] },
      ]);
      const updateInstitution = vi.spyOn(container.updateInstitutionUseCase, "execute").mockResolvedValue(undefined);
      const user = userEvent.setup();
      renderPage();

      await user.click(await screen.findByRole("checkbox", { name: "Selecionar Hospital Pausado" }));
      await user.click(screen.getByRole("button", { name: "Ativar" }));

      await waitFor(() =>
        expect(updateInstitution).toHaveBeenCalledWith("token", "1", { isActive: true }),
      );
    });
  });

  it("filters the list by name, invite code, or hospital admin name", async () => {
    vi.spyOn(container.listInstitutionsUseCase, "execute").mockResolvedValue([
      { id: "1", name: "Hospital São Lucas", inviteCode: "sao-lucas-2026", isActive: true, createdAt: "2026-08-01T00:00:00.000Z", hospitalAdminNames: ["Ana"] },
      { id: "2", name: "Hospital Vida Nova", inviteCode: "vida-nova-2026", isActive: true, createdAt: "2026-08-01T00:00:00.000Z", hospitalAdminNames: ["Bruno"] },
    ]);
    const user = userEvent.setup();
    renderPage();

    const table = within(await screen.findByRole("table"));
    expect(table.getByText("Hospital São Lucas")).toBeInTheDocument();
    expect(table.getByText("Hospital Vida Nova")).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText("Buscar…"), "vida nova");

    await waitFor(() => expect(table.queryByText("Hospital São Lucas")).not.toBeInTheDocument());
    expect(table.getByText("Hospital Vida Nova")).toBeInTheDocument();
  });
});
