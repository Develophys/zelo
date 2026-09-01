import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminInstitutionsPage } from "./AdminInstitutionsPage";
import * as container from "@/app/container";
import { useAdminSessionStore } from "@/stores/admin-session.store";

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/admin"]}>
        <Routes>
          <Route path="/admin" element={<AdminInstitutionsPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminInstitutionsPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
    useAdminSessionStore.getState().setSession("token", new Date(Date.now() + 60_000).toISOString());
  });

  it("lists existing institutions", async () => {
    vi.spyOn(container.listInstitutionsUseCase, "execute").mockResolvedValue([
      { id: "1", name: "Hospital Teste", inviteCode: "teste-2026", createdAt: "2026-08-01T00:00:00.000Z", hospitalAdminNames: ["Mauricio"] },
    ]);
    renderPage();

    expect(await screen.findByText("Hospital Teste")).toBeInTheDocument();
  });

  it("creates an institution and shows the invite confirmation", async () => {
    vi.spyOn(container.listInstitutionsUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.createInstitutionUseCase, "execute").mockResolvedValue({
      institution: { id: "1", name: "Hospital Teste", inviteCode: "teste-2026" },
      hospitalAdmin: { id: "m1", name: "Mauricio", email: "mauricio@zelo-demo.local" },
    });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Nome do hospital"), "Hospital Teste");
    await user.type(screen.getByLabelText("Código de convite"), "teste-2026");
    await user.type(screen.getByLabelText("Nome do gestor do hospital"), "Mauricio");
    await user.type(screen.getByLabelText("Email do gestor do hospital"), "mauricio@zelo-demo.local");
    await user.click(screen.getByRole("button", { name: "Criar instituição" }));

    await waitFor(() => expect(screen.getByText("Convite enviado para mauricio@zelo-demo.local.")).toBeInTheDocument());
  });

  it("insets the submit button by the same horizontal padding as the card so its edges line up with the fields", async () => {
    vi.spyOn(container.listInstitutionsUseCase, "execute").mockResolvedValue([]);
    renderPage();

    expect(await screen.findByRole("button", { name: "Criar instituição" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Criar instituição" }).parentElement).toHaveClass("px-4.5");
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
});
