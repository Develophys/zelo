import { describe, expect, it, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Routes, Route } from "react-router";
import { ConsentPage } from "./ConsentPage";
import { useConsentStore } from "@/stores/consent.store";

function renderConsent() {
  return render(
    <MemoryRouter initialEntries={["/consent"]}>
      <Routes>
        <Route path="/consent" element={<ConsentPage />} />
        <Route path="/privacy" element={<div>Privacy screen</div>} />
        <Route path="/home" element={<div>Home screen</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ConsentPage", () => {
  beforeEach(() => {
    useConsentStore.setState({ hasConsented: false, consentedAt: null });
  });

  it("renders the three consent rows and the encryption note", () => {
    renderConsent();
    expect(screen.getByText(/não emite diagnóstico/)).toBeInTheDocument();
    expect(screen.getByText(/anônimo e agregado/)).toBeInTheDocument();
    expect(screen.getByText(/eu escolher/)).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /Criptografia AES-256 no seu aparelho/ }),
    ).toBeInTheDocument();
  });

  it("grants consent and navigates to /home when accepted", async () => {
    renderConsent();
    await userEvent.click(screen.getByRole("button", { name: "Aceitar e entrar" }));
    expect(useConsentStore.getState().hasConsented).toBe(true);
    expect(useConsentStore.getState().consentedAt).not.toBeNull();
    expect(screen.getByText("Home screen")).toBeInTheDocument();
  });

  it("still navigates to /home when persisting consent to storage fails", async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("QuotaExceededError");
    });

    renderConsent();
    await userEvent.click(screen.getByRole("button", { name: "Aceitar e entrar" }));

    expect(useConsentStore.getState().hasConsented).toBe(true);
    expect(screen.getByText("Home screen")).toBeInTheDocument();

    setItemSpy.mockRestore();
  });

  it("navigates back to /privacy", async () => {
    renderConsent();
    await userEvent.click(screen.getByRole("button", { name: /voltar/i }));
    expect(screen.getByText("Privacy screen")).toBeInTheDocument();
  });

  it("opens the encryption info modal when the encryption note is tapped", async () => {
    renderConsent();

    await userEvent.click(
      screen.getByRole("button", { name: /Criptografia AES-256 no seu aparelho/ }),
    );

    expect(screen.getByRole("dialog", { name: "Criptografia AES-256" })).toBeInTheDocument();
  });

  it("closes the encryption info modal from the close button", async () => {
    renderConsent();
    await userEvent.click(
      screen.getByRole("button", { name: /Criptografia AES-256 no seu aparelho/ }),
    );

    await userEvent.click(screen.getByRole("button", { name: "Fechar" }));

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
