import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AdminLoginPage } from "./AdminLoginPage";
import * as container from "@/app/container";
import { InvalidAdminCredentialsError } from "@/ports/admin-auth.port";

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/admin/login"]}>
        <Routes>
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="/admin" element={<div>Admin institutions</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("AdminLoginPage", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("navigates to /admin on a correct name and password", async () => {
    vi.spyOn(container.loginAdminUseCase, "execute").mockResolvedValue({
      token: "abc.def",
      expiresAt: new Date(Date.now() + 60_000).toISOString(),
    });
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Nome"), "Zelo Ops");
    await user.type(screen.getByLabelText("Senha"), "correct-password");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    expect(await screen.findByText("Admin institutions")).toBeInTheDocument();
  });

  it("shows an inline error on invalid credentials, without navigating", async () => {
    vi.spyOn(container.loginAdminUseCase, "execute").mockRejectedValue(new InvalidAdminCredentialsError());
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Nome"), "Zelo Ops");
    await user.type(screen.getByLabelText("Senha"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Entrar" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Nome ou senha incorretos."));
    expect(screen.queryByText("Admin institutions")).not.toBeInTheDocument();
  });
});
