import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ManagerLoginPage } from "./ManagerLoginPage";
import * as container from "@/app/container";
import { InvalidManagerCredentialsError } from "@/ports/manager-auth.port";

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/manager/login"]}>
        <Routes>
          <Route path="/manager/login" element={<ManagerLoginPage />} />
          <Route path="/manager" element={<div>Manager dashboard</div>} />
          <Route path="/home" element={<div>Home screen</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ManagerLoginPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("navigates to /manager on a correct name and password", async () => {
    vi.spyOn(container.loginManagerUseCase, "execute").mockResolvedValue({
      token: "abc.def",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
      role: "HOSPITAL_ADMIN",
    });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Nome"), "Ana Konder");
    await user.type(screen.getByLabelText("Senha"), "senha-correta");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("Manager dashboard")).toBeInTheDocument();
  });

  it("shows an inline error on incorrect credentials, without navigating", async () => {
    vi.spyOn(container.loginManagerUseCase, "execute").mockRejectedValue(new InvalidManagerCredentialsError());
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Nome"), "Ana Konder");
    await user.type(screen.getByLabelText("Senha"), "wrong");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Nome ou senha incorretos.");
    });
    expect(screen.queryByText("Manager dashboard")).not.toBeInTheDocument();
  });

  it("disables the submit button until both fields are filled", async () => {
    renderPage();
    expect(screen.getByRole("button", { name: "Entrar" })).toBeDisabled();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Nome"), "Ana Konder");
    expect(screen.getByRole("button", { name: "Entrar" })).toBeDisabled();

    await user.type(screen.getByLabelText("Senha"), "senha-correta");
    expect(screen.getByRole("button", { name: "Entrar" })).not.toBeDisabled();
  });
});
