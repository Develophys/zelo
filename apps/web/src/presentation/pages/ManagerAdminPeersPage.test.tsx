import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ManagerAdminPeersPage } from "./ManagerAdminPeersPage";
import * as container from "@/app/container";
import { useManagerSessionStore } from "@/stores/manager-session.store";

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
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.listPeerPartnersUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.createPeerPartnerUseCase, "execute").mockResolvedValue({
      peerPartner: { id: "peer-1", name: "Dra. Ana", email: "ana@zelo-demo.local" },
    });
    const user = userEvent.setup();
    renderPage();

    await user.type(await screen.findByLabelText("Nome do par"), "Dra. Ana");
    await user.type(screen.getByLabelText("Email do par"), "ana@zelo-demo.local");
    await user.type(screen.getByLabelText("Especialidade"), "Clínica médica");
    await user.click(screen.getByRole("button", { name: "Adicionar par" }));

    await waitFor(() => expect(screen.getByText("Convite enviado para ana@zelo-demo.local.")).toBeInTheDocument());
  });

  it("resends a set-password email for an active peer partner", async () => {
    vi.spyOn(container.listSectorsUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.listManagersUseCase, "execute").mockResolvedValue([]);
    vi.spyOn(container.listPeerPartnersUseCase, "execute").mockResolvedValue([
      { id: "peer-5", name: "Dr. Paulo", email: "paulo@zelo-demo.local", specialty: "Clínica médica", isActive: true, hasPassword: true, setPasswordTokenExpiresAt: null },
    ]);
    vi.spyOn(container.sendPeerPartnerSetPasswordEmailUseCase, "execute").mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText(/Senha definida/)).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Redefinir senha de Dr. Paulo" }));

    await waitFor(() => expect(container.sendPeerPartnerSetPasswordEmailUseCase.execute).toHaveBeenCalledWith("token", "peer-5"));
    await waitFor(() => expect(screen.getByText("Convite enviado para paulo@zelo-demo.local.")).toBeInTheDocument());
  });
});
