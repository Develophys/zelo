import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { FinishSetupForm } from "./FinishSetupForm";

function renderWithToken(token: string, onSubmit: (params: { token: string; password: string }) => Promise<void>) {
  return render(
    <MemoryRouter initialEntries={[`/finish-setup/${token}`]}>
      <Routes>
        <Route path="/finish-setup/:token" element={<FinishSetupForm onSubmit={onSubmit} onSuccess={() => {}} />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("FinishSetupForm", () => {
  it("calls onSubmit with the token from the URL and the entered password, then onSuccess", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const onSuccess = vi.fn();
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={["/finish-setup/abc123"]}>
        <Routes>
          <Route path="/finish-setup/:token" element={<FinishSetupForm onSubmit={onSubmit} onSuccess={onSuccess} />} />
        </Routes>
      </MemoryRouter>,
    );

    await user.type(screen.getByLabelText("Senha"), "new-password-123");
    await user.type(screen.getByLabelText("Confirme a senha"), "new-password-123");
    await user.click(screen.getByRole("button", { name: "Definir senha" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ token: "abc123", password: "new-password-123" }));
    await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  });

  it("disables submit until both password fields match and are at least 8 characters", async () => {
    const user = userEvent.setup();
    renderWithToken("abc123", vi.fn());

    expect(screen.getByRole("button", { name: "Definir senha" })).toBeDisabled();

    await user.type(screen.getByLabelText("Senha"), "short");
    await user.type(screen.getByLabelText("Confirme a senha"), "short");
    expect(screen.getByRole("button", { name: "Definir senha" })).toBeDisabled();

    await user.clear(screen.getByLabelText("Senha"));
    await user.clear(screen.getByLabelText("Confirme a senha"));
    await user.type(screen.getByLabelText("Senha"), "long-enough-1");
    await user.type(screen.getByLabelText("Confirme a senha"), "different-password");
    expect(screen.getByRole("button", { name: "Definir senha" })).toBeDisabled();

    await user.clear(screen.getByLabelText("Confirme a senha"));
    await user.type(screen.getByLabelText("Confirme a senha"), "long-enough-1");
    expect(screen.getByRole("button", { name: "Definir senha" })).not.toBeDisabled();
  });

  it("shows an inline error when onSubmit rejects, without calling onSuccess", async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error("expired"));
    const onSuccess = vi.fn();
    const user = userEvent.setup();

    render(
      <MemoryRouter initialEntries={["/finish-setup/abc123"]}>
        <Routes>
          <Route path="/finish-setup/:token" element={<FinishSetupForm onSubmit={onSubmit} onSuccess={onSuccess} />} />
        </Routes>
      </MemoryRouter>,
    );
    await user.type(screen.getByLabelText("Senha"), "long-enough-1");
    await user.type(screen.getByLabelText("Confirme a senha"), "long-enough-1");
    await user.click(screen.getByRole("button", { name: "Definir senha" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Não foi possível concluir"));
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("shows an inline error and disables submit when the URL has no token", () => {
    render(
      <MemoryRouter initialEntries={["/finish-setup"]}>
        <Routes>
          <Route path="/finish-setup" element={<FinishSetupForm onSubmit={vi.fn()} onSuccess={vi.fn()} />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Link inválido");
    expect(screen.getByRole("button", { name: "Definir senha" })).toBeDisabled();
  });
});
