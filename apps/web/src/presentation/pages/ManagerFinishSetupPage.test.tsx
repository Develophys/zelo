import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ManagerFinishSetupPage } from "./ManagerFinishSetupPage";
import * as container from "@/app/container";

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/manager/finish-setup/abc123"]}>
        <Routes>
          <Route path="/manager/finish-setup/:token" element={<ManagerFinishSetupPage />} />
          <Route path="/manager/login" element={<div>Manager login screen</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ManagerFinishSetupPage", () => {
  it("navigates to the manager login page after successfully setting the password", async () => {
    vi.spyOn(container.finishManagerSetupUseCase, "execute").mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Senha"), "new-password-123");
    await user.type(screen.getByLabelText("Confirme a senha"), "new-password-123");
    await user.click(screen.getByRole("button", { name: "Definir senha" }));

    expect(await screen.findByText("Manager login screen")).toBeInTheDocument();
  });
});
