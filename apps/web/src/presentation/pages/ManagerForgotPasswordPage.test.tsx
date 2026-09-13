import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ManagerForgotPasswordPage } from "./ManagerForgotPasswordPage";
import * as container from "@/app/container";

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={["/manager/forgot-password"]}>
        <Routes>
          <Route path="/manager/forgot-password" element={<ManagerForgotPasswordPage />} />
          <Route path="/manager/login" element={<div>Manager login screen</div>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe("ManagerForgotPasswordPage", () => {
  it("submits the typed email to the use case", async () => {
    const request = vi.spyOn(container.requestManagerPasswordResetUseCase, "execute").mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Email"), "ana@zelo-demo.local");
    await user.click(screen.getByRole("button", { name: "Enviar link" }));

    await waitFor(() => expect(request).toHaveBeenCalledWith("ana@zelo-demo.local"));
  });

  it("shows the same generic confirmation whether or not the email exists, never disclosing which", async () => {
    vi.spyOn(container.requestManagerPasswordResetUseCase, "execute").mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Email"), "unknown@zelo-demo.local");
    await user.click(screen.getByRole("button", { name: "Enviar link" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      /se esse e-mail tiver uma conta, enviamos um link/i,
    );
    // The form disappears — nothing left to resubmit, and no hint either way.
    expect(screen.queryByLabelText("Email")).not.toBeInTheDocument();
  });

  it("still shows the generic confirmation even when the request itself fails over the network", async () => {
    // A network failure must never read as "that email doesn't exist" or any
    // other disclosure — the honest, safe answer is identical either way.
    vi.spyOn(container.requestManagerPasswordResetUseCase, "execute").mockRejectedValue(new Error("network down"));
    const user = userEvent.setup();
    renderPage();

    await user.type(screen.getByLabelText("Email"), "ana@zelo-demo.local");
    await user.click(screen.getByRole("button", { name: "Enviar link" }));

    expect(await screen.findByRole("status")).toHaveTextContent(
      /se esse e-mail tiver uma conta, enviamos um link/i,
    );
  });

  it("disables the submit button until the email looks valid", async () => {
    renderPage();
    expect(screen.getByRole("button", { name: "Enviar link" })).toBeDisabled();

    const user = userEvent.setup();
    await user.type(screen.getByLabelText("Email"), "not-an-email");
    expect(screen.getByRole("button", { name: "Enviar link" })).toBeDisabled();

    await user.clear(screen.getByLabelText("Email"));
    await user.type(screen.getByLabelText("Email"), "ana@zelo-demo.local");
    expect(screen.getByRole("button", { name: "Enviar link" })).not.toBeDisabled();
  });

  it("links back to the login screen", () => {
    renderPage();
    expect(screen.getByRole("link", { name: /voltar para o login/i })).toHaveAttribute("href", "/manager/login");
  });
});
