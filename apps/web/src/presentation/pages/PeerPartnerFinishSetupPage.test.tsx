import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PeerPartnerFinishSetupPage } from "./PeerPartnerFinishSetupPage";
import * as container from "@/app/container";

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/peer/finish-setup/abc123"]}>
        <Routes>
          <Route path="/peer/finish-setup/:token" element={<PeerPartnerFinishSetupPage />} />
          <Route path="/peer/login" element={<div>Peer partner login screen</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PeerPartnerFinishSetupPage", () => {
  it("navigates to the peer-partner login page after successfully setting the password", async () => {
    vi.spyOn(container.finishPeerPartnerSetupUseCase, "execute").mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Senha"), "new-password-123");
    await user.type(screen.getByLabelText("Confirme a senha"), "new-password-123");
    await user.click(screen.getByRole("button", { name: "Definir senha" }));

    expect(await screen.findByText("Peer partner login screen")).toBeInTheDocument();
  });
});
