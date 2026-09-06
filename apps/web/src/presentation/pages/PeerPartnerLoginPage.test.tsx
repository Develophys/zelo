import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { PeerPartnerLoginPage } from "./PeerPartnerLoginPage";
import * as container from "@/app/container";
import { InvalidPeerPartnerCredentialsError } from "@/ports/peer-partner-auth.port";

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/peer/login"]}>
        <Routes>
          <Route path="/peer/login" element={<PeerPartnerLoginPage />} />
          <Route path="/peer" element={<div>Peer partner inbox</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("PeerPartnerLoginPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("navigates to /peer on a correct email and password", async () => {
    vi.spyOn(container.loginPeerPartnerUseCase, "execute").mockResolvedValue({
      token: "abc.def",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      peerPartnerName: "Dra. Ana",
    });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Email"), "ana@zelo-demo.local");
    await user.type(screen.getByLabelText("Senha"), "correct-password");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("Peer partner inbox")).toBeInTheDocument();
  });

  it("shows an inline error on invalid credentials, without navigating", async () => {
    vi.spyOn(container.loginPeerPartnerUseCase, "execute").mockRejectedValue(new InvalidPeerPartnerCredentialsError());
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Email"), "ana@zelo-demo.local");
    await user.type(screen.getByLabelText("Senha"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Email ou senha incorretos."));
    expect(screen.queryByText("Peer partner inbox")).not.toBeInTheDocument();
  });
});
